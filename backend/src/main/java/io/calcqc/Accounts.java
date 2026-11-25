package io.calcqc;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class Accounts implements UserDetailsService {
    record Credentials(
            @NotNull @Pattern(regexp = "[A-Za-z0-9_.-]{3,32}",
                    message = "用户名须为 3 至 32 位英文字母、数字或 ._-") String username,
            @NotNull @Size(min = 8, max = 72, message = "密码长度须为 8 至 72 个字符") String password) {
    }

    record Account(long id, String username, String passwordHash, AccountRole role) {
    }

    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;

    Accounts(JdbcTemplate jdbc, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.passwords = passwords;
    }

    @Transactional
    public void register(Credentials credentials) {
        if (credentials.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "密码的 UTF-8 长度最多为 72 字节");
        }
        String username = normalize(credentials.username());
        try {
            jdbc.update("INSERT INTO app_user (username, password_hash) VALUES (?, ?)",
                    username, passwords.encode(credentials.password()));
        } catch (DuplicateKeyException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "用户名已存在");
        }
    }

    Account require(String username) {
        return find(username).orElseThrow(() -> new UsernameNotFoundException("账号不存在"));
    }

    @Override
    public UserDetails loadUserByUsername(String username) {
        var account = require(username);
        return User.withUsername(account.username()).password(account.passwordHash()).roles(account.role().name()).build();
    }

    private Optional<Account> find(String username) {
        return jdbc.query("SELECT id, username, password_hash, account_role FROM app_user WHERE username = ?",
                (rs, i) -> new Account(rs.getLong(1), rs.getString(2), rs.getString(3), AccountRole.valueOf(rs.getString(4))),
                normalize(username)).stream().findFirst();
    }

    private static String normalize(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }
}
