package io.calcqc;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class WorkspaceData {
    private static final String INPUT_NUMBER = "(?:[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?)?";

    record Brand(
            @NotNull UUID id,
            @NotBlank @Size(max = 120) String name,
            @NotNull @Positive @Digits(integer = 9, fraction = 6) BigDecimal wholesale,
            @Positive @Digits(integer = 9, fraction = 6) BigDecimal market,
            @NotNull @Size(max = 500) List<@NotBlank @Size(max = 12) String> tags) {
    }

    record Catalog(
            @PositiveOrZero long revision,
            @NotNull @Size(max = 500) List<@NotBlank @Size(max = 12) String> tags,
            @NotNull @Size(max = 5000) List<@NotNull @Valid Brand> brands) {
    }

    record SnapshotItem(
            @NotNull UUID brandId,
            @Size(max = 32) @Pattern(regexp = INPUT_NUMBER) String wholesale,
            @Size(max = 32) @Pattern(regexp = INPUT_NUMBER) String market,
            @Size(max = 16) @Pattern(regexp = INPUT_NUMBER) String quantity,
            boolean hidden) {
    }

    record Snapshot(
            Instant savedAt,
            @NotNull @Size(max = 5000) List<@NotNull @Valid SnapshotItem> items) {
    }

    record WorkspaceState(@NotNull @Valid Catalog catalog, @Valid Snapshot snapshot) {
    }

    private WorkspaceData() {
    }
}
