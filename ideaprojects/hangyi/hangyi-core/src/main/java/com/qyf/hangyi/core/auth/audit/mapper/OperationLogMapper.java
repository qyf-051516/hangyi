package com.qyf.hangyi.core.auth.audit.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.qyf.hangyi.core.auth.audit.entity.OperationLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OperationLogMapper extends BaseMapper<OperationLog> {
}
