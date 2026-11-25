CREATE TABLE app_user (
    id BIGINT NOT NULL AUTO_INCREMENT,
    username VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    password_hash VARCHAR(100) CHARACTER SET ascii NOT NULL,
    catalog_revision BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_app_user_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE brand (
    user_id BIGINT NOT NULL,
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    name VARCHAR(120) NOT NULL,
    wholesale DECIMAL(15,6) NOT NULL,
    market DECIMAL(15,6),
    sort_order INT NOT NULL,
    PRIMARY KEY (user_id, id),
    KEY ix_brand_order (user_id, sort_order),
    CONSTRAINT fk_brand_user FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE,
    CHECK (wholesale > 0),
    CHECK (market IS NULL OR market > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE tag (
    user_id BIGINT NOT NULL,
    name VARCHAR(12) NOT NULL,
    sort_order INT NOT NULL,
    PRIMARY KEY (user_id, name),
    CONSTRAINT fk_tag_user FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE brand_tag (
    user_id BIGINT NOT NULL,
    brand_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tag_name VARCHAR(12) NOT NULL,
    sort_order INT NOT NULL,
    PRIMARY KEY (user_id, brand_id, tag_name),
    CONSTRAINT fk_brand_tag_brand FOREIGN KEY (user_id, brand_id) REFERENCES brand (user_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_brand_tag_tag FOREIGN KEY (user_id, tag_name) REFERENCES tag (user_id, name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE calc_snapshot (
    user_id BIGINT NOT NULL,
    saved_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_snapshot_user FOREIGN KEY (user_id) REFERENCES app_user (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE calc_snapshot_item (
    user_id BIGINT NOT NULL,
    brand_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    wholesale_override VARCHAR(32) CHARACTER SET ascii,
    market_override VARCHAR(32) CHARACTER SET ascii,
    quantity VARCHAR(16) CHARACTER SET ascii,
    is_hidden BOOLEAN NOT NULL,
    PRIMARY KEY (user_id, brand_id),
    CONSTRAINT fk_snapshot_item_head FOREIGN KEY (user_id) REFERENCES calc_snapshot (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_snapshot_item_brand FOREIGN KEY (user_id, brand_id) REFERENCES brand (user_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
