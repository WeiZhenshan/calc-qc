package io.calcqc;

import jakarta.validation.Valid;
import java.security.Principal;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
class AuthController {
    record UserResponse(long id, String username, AccountRole role) {
    }

    record CsrfResponse(String headerName, String token) {
    }

    private final Accounts accounts;

    AuthController(Accounts accounts) {
        this.accounts = accounts;
    }

    @GetMapping("/csrf")
    CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getHeaderName(), token.getToken());
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    void register(@Valid @RequestBody Accounts.Credentials credentials) {
        accounts.register(credentials);
    }

    @GetMapping("/me")
    UserResponse me(Principal principal) {
        var account = accounts.require(principal.getName());
        return new UserResponse(account.id(), account.username(), account.role());
    }
}
