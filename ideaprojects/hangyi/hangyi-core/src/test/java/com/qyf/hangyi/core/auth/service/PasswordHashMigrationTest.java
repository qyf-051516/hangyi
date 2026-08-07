package com.qyf.hangyi.core.auth.service;

import com.qyf.hangyi.core.auth.entity.SysUser;
import com.qyf.hangyi.core.auth.mapper.SysUserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PasswordHashMigrationTest {

    @Mock
    private SysUserMapper userMapper;

    @Mock
    private PasswordEncoder passwordEncoder;

    @InjectMocks
    private PasswordHashMigration migration;

    @Test
    void migratesOnlyLegacyPlaintextPasswords() {
        SysUser legacy = user(1L, "123456");
        SysUser hashed = user(2L, "$2b$12$abcdefghijklmnopqrstuu1234567890123456789012345678901");
        when(userMapper.selectList(null)).thenReturn(List.of(legacy, hashed));
        when(passwordEncoder.encode("123456")).thenReturn("$2b$12$new-hash");

        migration.run(null);

        ArgumentCaptor<SysUser> captor = ArgumentCaptor.forClass(SysUser.class);
        verify(userMapper).updateById(captor.capture());
        assertThat(captor.getValue().getId()).isEqualTo(1L);
        assertThat(captor.getValue().getPassword()).isEqualTo("$2b$12$new-hash");
        verify(passwordEncoder, never()).encode(hashed.getPassword());
    }

    @Test
    void databaseSeedHashMatchesDocumentedInitialPassword() {
        PasswordEncoder encoder = new BCryptPasswordEncoder();

        assertThat(encoder.matches("123456",
                "$2y$12$MkhucGOGV0eVw8sRuIh6d.e4wgE0y4VSqOvM7gQRAc1fDo9PsTVQq"))
                .isTrue();
    }

    private SysUser user(Long id, String password) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setPassword(password);
        return user;
    }
}
