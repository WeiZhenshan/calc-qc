package io.calcqc;

import static io.calcqc.WorkspaceData.*;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class Workspace {
    private final JdbcTemplate jdbc;

    Workspace(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public WorkspaceState load(long userId) {
        long revision = jdbc.queryForObject("SELECT revision FROM shared_catalog WHERE id = 1", Long.class);
        return new WorkspaceState(loadCatalog(revision), loadSnapshot(userId));
    }

    @Transactional
    public Catalog saveCatalog(long userId, Catalog catalog) {
        if (!lockRole(userId).canEditCatalog()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "当前角色无权修改品牌库");
        }
        long revision = jdbc.queryForObject(
                "SELECT revision FROM shared_catalog WHERE id = 1 FOR UPDATE", Long.class);
        if (catalog.revision() != revision) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "品牌库已在其他页面修改，请重新加载后再保存");
        }

        var allowedTags = new HashSet<>(catalog.tags());
        if (allowedTags.size() != catalog.tags().size()) badRequest("标签名称重复");

        var brandIds = new HashSet<String>();
        var brandRows = new ArrayList<Object[]>();
        var assignmentRows = new ArrayList<Object[]>();
        for (int i = 0; i < catalog.brands().size(); i++) {
            var brand = catalog.brands().get(i);
            String id = brand.id().toString();
            if (!brandIds.add(id)) badRequest("品牌 ID 重复");
            brandRows.add(new Object[] {id, brand.name(), brand.wholesale(), brand.market(), i});

            var assigned = new HashSet<String>();
            for (int j = 0; j < brand.tags().size(); j++) {
                String tag = brand.tags().get(j);
                if (!allowedTags.contains(tag) || !assigned.add(tag)) badRequest("品牌的标签分配无效");
                assignmentRows.add(new Object[] {id, tag, j});
            }
        }

        jdbc.batchUpdate("DELETE FROM shared_brand WHERE id = ?", brandIds().stream()
                .filter(id -> !brandIds.contains(id)).map(id -> new Object[] {id}).toList());
        jdbc.batchUpdate("""
                INSERT INTO shared_brand (id, name, wholesale, market, sort_order)
                VALUES (?, ?, ?, ?, ?) AS incoming
                ON DUPLICATE KEY UPDATE name = incoming.name, wholesale = incoming.wholesale,
                    market = incoming.market, sort_order = incoming.sort_order
                """, brandRows);
        jdbc.update("DELETE FROM shared_tag");

        var tagRows = new ArrayList<Object[]>();
        for (int i = 0; i < catalog.tags().size(); i++) {
            tagRows.add(new Object[] {catalog.tags().get(i), i});
        }
        jdbc.batchUpdate("INSERT INTO shared_tag (name, sort_order) VALUES (?, ?)", tagRows);
        jdbc.batchUpdate("""
                INSERT INTO shared_brand_tag (brand_id, tag_name, sort_order) VALUES (?, ?, ?)
                """, assignmentRows);
        jdbc.update("UPDATE shared_catalog SET revision = revision + 1 WHERE id = 1");

        return new Catalog(revision + 1, catalog.tags(), catalog.brands());
    }

    @Transactional
    public Snapshot saveSnapshot(long userId, Snapshot snapshot) {
        var role = lockRole(userId);
        jdbc.queryForObject("SELECT revision FROM shared_catalog WHERE id = 1 FOR SHARE", Long.class);
        if (!role.canRemoveRows() && snapshot.items().stream().anyMatch(SnapshotItem::hidden)) {
            var alreadyHidden = new HashSet<>(jdbc.queryForList(
                    "SELECT brand_id FROM user_calculation_item WHERE user_id = ? AND is_hidden = TRUE", String.class, userId));
            if (snapshot.items().stream().anyMatch(item -> item.hidden() && !alreadyHidden.contains(item.brandId().toString()))) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "只有管理员可以移除计算器行");
            }
        }
        var brandIds = new HashSet<>(brandIds());
        var seen = new HashSet<UUID>();
        var rows = new ArrayList<Object[]>();
        for (SnapshotItem item : snapshot.items()) {
            if (!seen.add(item.brandId())) badRequest("快照包含重复品牌");
            String brandId = item.brandId().toString();
            if (!brandIds.contains(brandId)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "品牌库已有变更，请重新加载后再保存快照");
            }
            rows.add(new Object[] {userId, brandId, item.wholesale(), item.market(), item.quantity(), item.hidden()});
        }

        Instant savedAt = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        jdbc.update("""
                INSERT INTO calc_snapshot (user_id, saved_at) VALUES (?, ?) AS incoming
                ON DUPLICATE KEY UPDATE saved_at = incoming.saved_at
                """, userId, Timestamp.from(savedAt));
        jdbc.update("DELETE FROM user_calculation_item WHERE user_id = ?", userId);
        jdbc.batchUpdate("""
                INSERT INTO user_calculation_item (user_id, brand_id, wholesale_override, market_override, quantity,
                    is_hidden) VALUES (?, ?, ?, ?, ?, ?)
                """, rows);
        return new Snapshot(savedAt, snapshot.items());
    }

    @Transactional
    public void clearSnapshot(long userId) {
        lockRole(userId);
        jdbc.update("DELETE FROM calc_snapshot WHERE user_id = ?", userId);
    }

    @Transactional
    public WorkspaceState importBackup(long userId, WorkspaceState state) {
        var catalog = saveCatalog(userId, state.catalog());
        if (state.snapshot() == null) {
            clearSnapshot(userId);
            return new WorkspaceState(catalog, null);
        }
        return new WorkspaceState(catalog, saveSnapshot(userId, state.snapshot()));
    }

    private Catalog loadCatalog(long revision) {
        var tags = jdbc.queryForList("SELECT name FROM shared_tag ORDER BY sort_order", String.class);
        var tagsByBrand = new HashMap<String, List<String>>();
        jdbc.query("""
                SELECT brand_id, tag_name FROM shared_brand_tag ORDER BY brand_id, sort_order
                """, rs -> {
            tagsByBrand.computeIfAbsent(rs.getString("brand_id"), id -> new ArrayList<>())
                    .add(rs.getString("tag_name"));
        });
        var brands = jdbc.query("SELECT * FROM shared_brand ORDER BY sort_order", (rs, i) -> {
            String id = rs.getString("id");
            return new Brand(UUID.fromString(id), rs.getString("name"), rs.getBigDecimal("wholesale"),
                    rs.getBigDecimal("market"), tagsByBrand.getOrDefault(id, List.of()));
        });
        return new Catalog(revision, tags, brands);
    }

    private Snapshot loadSnapshot(long userId) {
        var timestamps = jdbc.query("SELECT saved_at FROM calc_snapshot WHERE user_id = ?",
                (rs, i) -> rs.getTimestamp("saved_at").toInstant(), userId);
        if (timestamps.isEmpty()) return null;

        var items = jdbc.query("""
                SELECT i.* FROM user_calculation_item i JOIN shared_brand b ON b.id = i.brand_id
                WHERE i.user_id = ? ORDER BY b.sort_order
                """, (rs, i) -> new SnapshotItem(UUID.fromString(rs.getString("brand_id")),
                rs.getString("wholesale_override"), rs.getString("market_override"),
                rs.getString("quantity"), rs.getBoolean("is_hidden")), userId);
        return new Snapshot(timestamps.get(0), items);
    }

    private List<String> brandIds() {
        return jdbc.queryForList("SELECT id FROM shared_brand", String.class);
    }

    private AccountRole lockRole(long userId) {
        return AccountRole.valueOf(jdbc.queryForObject(
                "SELECT account_role FROM app_user WHERE id = ? FOR UPDATE", String.class, userId));
    }

    private static void badRequest(String message) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
