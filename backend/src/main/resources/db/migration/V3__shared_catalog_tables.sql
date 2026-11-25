CREATE TABLE shared_catalog (
    id TINYINT PRIMARY KEY CHECK (id = 1),
    revision BIGINT NOT NULL
) ENGINE=InnoDB;

CREATE TABLE shared_brand (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    wholesale DECIMAL(15,6) NOT NULL CHECK (wholesale > 0),
    market DECIMAL(15,6) CHECK (market > 0),
    sort_order INT NOT NULL,
    INDEX (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE shared_tag (
    name VARCHAR(12) PRIMARY KEY,
    sort_order INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE shared_brand_tag (
    brand_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tag_name VARCHAR(12) NOT NULL,
    sort_order INT NOT NULL,
    PRIMARY KEY (brand_id, tag_name),
    FOREIGN KEY (brand_id) REFERENCES shared_brand (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_name) REFERENCES shared_tag (name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;

CREATE TABLE user_calculation_item (
    user_id BIGINT NOT NULL,
    brand_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    wholesale_override VARCHAR(32) CHARACTER SET ascii,
    market_override VARCHAR(32) CHARACTER SET ascii,
    quantity VARCHAR(16) CHARACTER SET ascii,
    is_hidden BOOLEAN NOT NULL,
    PRIMARY KEY (user_id, brand_id),
    FOREIGN KEY (user_id) REFERENCES calc_snapshot (user_id) ON DELETE CASCADE,
    FOREIGN KEY (brand_id) REFERENCES shared_brand (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_bin;
