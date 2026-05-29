package com.qyf.hangyi.auth.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.qyf.hangyi.auth.entity.SysUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface SysUserMapper extends BaseMapper<SysUser> {

    @Select("SELECT r.role_code FROM sys_user_role ur " +
            "JOIN sys_role r ON r.id = ur.role_id " +
            "WHERE ur.user_id = #{userId}")
    List<String> findRoleCodesByUserId(Long userId);

    @Select("SELECT * FROM sys_user WHERE wechat_openid = #{openid}")
    SysUser findByWechatOpenid(String openid);
}
