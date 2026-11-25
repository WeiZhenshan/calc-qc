package io.calcqc;

import static io.calcqc.WorkspaceData.*;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.security.Principal;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/workspace")
class WorkspaceController {
    private final Accounts accounts;
    private final Workspace workspace;

    WorkspaceController(Accounts accounts, Workspace workspace) {
        this.accounts = accounts;
        this.workspace = workspace;
    }

    @GetMapping
    WorkspaceState load(Principal principal, HttpServletRequest request) {
        return workspace.load(userId(principal, request));
    }

    @PutMapping("/catalog")
    Catalog saveCatalog(Principal principal, HttpServletRequest request, @Valid @RequestBody Catalog catalog) {
        return workspace.saveCatalog(userId(principal, request), catalog);
    }

    @PutMapping("/snapshot")
    Snapshot saveSnapshot(Principal principal, HttpServletRequest request, @Valid @RequestBody Snapshot snapshot) {
        return workspace.saveSnapshot(userId(principal, request), snapshot);
    }

    @DeleteMapping("/snapshot")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void clearSnapshot(Principal principal, HttpServletRequest request) {
        workspace.clearSnapshot(userId(principal, request));
    }

    @PutMapping("/backup")
    WorkspaceState importBackup(Principal principal, HttpServletRequest request, @Valid @RequestBody WorkspaceState state) {
        return workspace.importBackup(userId(principal, request), state);
    }

    private long userId(Principal principal, HttpServletRequest request) {
        long id = accounts.require(principal.getName()).id();
        if (!Long.toString(id).equals(request.getHeader("X-Workspace-User"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "会话账号已改变，请重新登录");
        }
        return id;
    }
}
