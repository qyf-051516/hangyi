package com.qyf.hangyi.leave.mapper;

import com.qyf.hangyi.leave.entity.LeaveRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class LeaveRequestMapperTest {

    @Autowired
    private LeaveRequestMapper leaveRequestMapper;

    @Test
    void testSelectById() {
        LeaveRequest leave = leaveRequestMapper.selectById(1L);
        assertThat(leave).isNotNull();
        assertThat(leave.getLeaveType()).isEqualTo("ANNUAL");
    }

    @Test
    void testSelectByStatus() {
        List<LeaveRequest> pending = leaveRequestMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<LeaveRequest>()
                        .eq(LeaveRequest::getStatus, 0));
        assertThat(pending).hasSize(2);
    }

    @Test
    void testSelectByEmployee() {
        List<LeaveRequest> leaves = leaveRequestMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<LeaveRequest>()
                        .eq(LeaveRequest::getEmployeeId, 1L));
        assertThat(leaves).hasSize(2);
    }
}
