package com.qyf.hangyi.auth.mapper;

import com.qyf.hangyi.auth.entity.SysUser;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class SysUserMapperTest {

    @Autowired
    private SysUserMapper sysUserMapper;

    @Test
    void testSelectById() {
        SysUser user = sysUserMapper.selectById(1L);
        assertThat(user).isNotNull();
        assertThat(user.getUsername()).isEqualTo("admin");
    }

    @Test
    void testFindRoleCodesByUserId() {
        List<String> roles = sysUserMapper.findRoleCodesByUserId(1L);
        assertThat(roles).isNotEmpty();
        assertThat(roles).contains("ADMIN");
    }
}
