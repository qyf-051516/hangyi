package com.qyf.hangyi.auth.controller;

import com.qyf.hangyi.auth.entity.SysUser;
import com.qyf.hangyi.auth.mapper.SysUserMapper;
import com.qyf.hangyi.common.result.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private SysUserMapper sysUserMapper;

    @GetMapping
    public R<List<SysUser>> list() {
        return R.ok(sysUserMapper.selectList(null));
    }

    @GetMapping("/{id}")
    public R<SysUser> getById(@PathVariable Long id) {
        return R.ok(sysUserMapper.selectById(id));
    }

    @GetMapping("/by-username")
    public R<SysUser> getByUsername(@RequestParam String username) {
        return R.ok(sysUserMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<SysUser>()
                        .eq(SysUser::getUsername, username)
        ));
    }
}
