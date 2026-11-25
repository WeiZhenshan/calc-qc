-- MySQL 8.0. Run while connected to the calc_qc schema.
-- The account must already exist. Set @calc_qc_seed_username before sourcing this script.
-- Only seed a catalog that currently has no brands.
SET NAMES utf8mb4;
START TRANSACTION;

SET @calc_qc_seed_user_id = NULL;
SELECT id INTO @calc_qc_seed_user_id
FROM app_user
WHERE username = CONVERT(LOWER(TRIM(@calc_qc_seed_username)) USING ascii) COLLATE ascii_bin
FOR UPDATE;

INSERT INTO brand (user_id, id, name, wholesale, market, sort_order)
SELECT @calc_qc_seed_user_id, UUID(), seed.name, seed.wholesale, NULL, seed.sort_order
FROM (
    SELECT 0 AS sort_order, '中华(硬)' AS name, 381 AS wholesale
    UNION ALL SELECT 1, '中华(软)', 583.5
    UNION ALL SELECT 2, '中华(双中支)', 450
    UNION ALL SELECT 3, '中华(金中支)', 678
    UNION ALL SELECT 4, '中华(细支)', 424
    UNION ALL SELECT 5, '利群(新版)', 122
    UNION ALL SELECT 6, '利群(软红长嘴)', 190
    UNION ALL SELECT 7, '利群(软阳光)', 280
    UNION ALL SELECT 8, '利群(西子阳光)', 220
    UNION ALL SELECT 9, '利群(夜西湖)', 158
    UNION ALL SELECT 10, '黄鹤楼(软蓝)', 170
    UNION ALL SELECT 11, '黄鹤楼(硬珍品)', 265
    UNION ALL SELECT 12, '黄鹤楼(软珍品)', 530
    UNION ALL SELECT 13, '黄鹤楼(硬红)', 170
    UNION ALL SELECT 14, '黄鹤楼(天下名楼)', 140
    UNION ALL SELECT 15, '芙蓉王(硬)', 218
    UNION ALL SELECT 16, '芙蓉王(软蓝)', 500
    UNION ALL SELECT 17, '芙蓉王(硬蓝)', 265
    UNION ALL SELECT 18, '玉溪(软)', 201
    UNION ALL SELECT 19, '玉溪(硬)', 206
    UNION ALL SELECT 20, '玉溪(软尚善)', 220
    UNION ALL SELECT 21, '云烟(软珍品)', 206
    UNION ALL SELECT 22, '云烟(紫)', 97
    UNION ALL SELECT 23, '云烟(细支珍品)', 212
    UNION ALL SELECT 24, '南京(炫赫门)', 143
    UNION ALL SELECT 25, '南京(红)', 106
    UNION ALL SELECT 26, '南京(雨花石)', 455
    UNION ALL SELECT 27, '南京(九五)', 848
    UNION ALL SELECT 28, '苏烟(五星红杉树)', 178
    UNION ALL SELECT 29, '苏烟(软金砂)', 424
    UNION ALL SELECT 30, '红塔山(经典1956)', 66
    UNION ALL SELECT 31, '红塔山(大经典)', 85
    UNION ALL SELECT 32, '黄金叶(乐途)', 130
    UNION ALL SELECT 33, '黄金叶(金满堂)', 95
    UNION ALL SELECT 34, '黄金叶(天叶)', 848
    UNION ALL SELECT 35, '双喜(软经典)', 72
    UNION ALL SELECT 36, '双喜(硬经典)', 85
    UNION ALL SELECT 37, '黄山(记忆)', 106
    UNION ALL SELECT 38, '黄山(大红方印)', 265
    UNION ALL SELECT 39, '白沙(和天下)', 848
    UNION ALL SELECT 40, '白沙(精品)', 72
    UNION ALL SELECT 41, '钻石(荷花)', 280
    UNION ALL SELECT 42, '贵烟(跨越)', 190
    UNION ALL SELECT 43, '云烟(小熊猫)', 178
) AS seed
WHERE @calc_qc_seed_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM brand WHERE user_id = @calc_qc_seed_user_id);

SET @calc_qc_seed_rows = ROW_COUNT();
UPDATE app_user
SET catalog_revision = catalog_revision + 1
WHERE id = @calc_qc_seed_user_id AND @calc_qc_seed_rows > 0;

COMMIT;
SELECT @calc_qc_seed_rows AS inserted_brands;
