package com.qyf.hangyi.employee.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.qyf.hangyi.employee.entity.AircraftType;
import com.qyf.hangyi.employee.mapper.AircraftTypeMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AircraftTypeService extends ServiceImpl<AircraftTypeMapper, AircraftType> {

    public List<AircraftType> listActive() {
        return lambdaQuery().eq(AircraftType::getStatus, 1).list();
    }
}
