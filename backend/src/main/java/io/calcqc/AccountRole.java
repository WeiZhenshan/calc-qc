package io.calcqc;

enum AccountRole {
    MERCHANT, ACCOUNT_MANAGER, ADMIN;

    boolean canEditCatalog() {
        return this == ACCOUNT_MANAGER || this == ADMIN;
    }

    boolean canRemoveRows() {
        return this == ADMIN;
    }
}
