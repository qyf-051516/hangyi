package com.qyf.hangyi.core.auth.service;

import com.qyf.hangyi.core.auth.entity.SysUser;
import com.qyf.hangyi.core.auth.mapper.SysUserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
public class PasswordHashMigration implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PasswordHashMigration.class);

    private final SysUserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    public PasswordHashMigration(SysUserMapper userMapper, PasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<SysUser> users = userMapper.selectList(null);
        int migrated = 0;
        for (SysUser user : users) {
            String password = user.getPassword();
            if (password == null || password.isBlank() || isBcryptHash(password)) {
                continue;
            }
            user.setPassword(passwordEncoder.encode(password));
            userMapper.updateById(user);
            migrated++;
        }
        if (migrated > 0) {
            log.info("已将 {} 个历史明文密码迁移为 BCrypt 哈希", migrated);
        }
    }

    private boolean isBcryptHash(String value) {
        return value.matches("^\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}$");
    }
}
