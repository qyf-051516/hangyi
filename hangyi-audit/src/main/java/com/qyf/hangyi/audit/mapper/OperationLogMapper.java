package com.qyf.hangyi.audit.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.qyf.hangyi.audit.entity.OperationLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface OperationLogMapper extends BaseMapper<OperationLog> {
}
