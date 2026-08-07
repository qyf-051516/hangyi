package com.qyf.hangyi.schedule.swap.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.schedule.service.ScheduleAssignmentComplianceService;
import com.qyf.hangyi.schedule.swap.entity.SwapRequest;
import com.qyf.hangyi.schedule.swap.mapper.SwapRequestMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;

@ExtendWith(MockitoExtension.class)
class SwapServiceImplTest {

    @BeforeAll
    static void initializeMyBatisMetadata() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        assistant.setCurrentNamespace("swapServiceTest");
        TableInfoHelper.initTableInfo(assistant, SwapRequest.class);
    }

    @Mock
    private SwapRequestMapper requestMapper;

    @Mock
    private ScheduleDetailMapper detailMapper;

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private ScheduleAssignmentComplianceService complianceService;

    @InjectMocks
    private SwapServiceImpl service;

    @Test
    void approvingSwapActuallyExchangesTheTwoEmployees() {
        SwapRequest request = new SwapRequest();
        request.setId(7L);
        request.setRequestType("SWAP");
        request.setStatus("PENDING");
        request.setSourceScheduleId(101L);
        request.setTargetScheduleId(102L);
        request.setSourceStaffId(11L);
        request.setTargetStaffId(12L);
        ScheduleDetail source = detail(101L, 11L);
        ScheduleDetail target = detail(102L, 12L);
        when(requestMapper.selectById(7L)).thenReturn(request);
        when(requestMapper.update(any(), any())).thenReturn(1);
        when(detailMapper.selectById(101L)).thenReturn(source);
        when(detailMapper.selectById(102L)).thenReturn(target);
        Map<String, Object> result = service.approve(99L, 7L, "APPROVE", "同意");

        assertThat(result).containsEntry("status", "APPROVED");
        assertThat(source.getEmployeeId()).isEqualTo(12L);
        assertThat(target.getEmployeeId()).isEqualTo(11L);
        verify(detailMapper).updateById(source);
        verify(detailMapper).updateById(target);
    }

    @Test
    void approvingSwapRejectsEmployeeOnApprovedLeave() {
        SwapRequest request = new SwapRequest();
        request.setId(8L);
        request.setRequestType("SWAP");
        request.setStatus("PENDING");
        request.setSourceScheduleId(101L);
        request.setTargetScheduleId(102L);
        request.setSourceStaffId(11L);
        request.setTargetStaffId(12L);
        when(requestMapper.selectById(8L)).thenReturn(request);
        when(requestMapper.update(any(), any())).thenReturn(1);
        when(detailMapper.selectById(101L)).thenReturn(detail(101L, 11L));
        when(detailMapper.selectById(102L)).thenReturn(detail(102L, 12L));
        doThrow(new com.qyf.hangyi.common.exception.BusinessException(409, "目标员工当日处于已批准请假期间"))
                .when(complianceService).validateAssignments(any(), any(), any());

        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> service.approve(99L, 8L, "APPROVE", "同意"))
                .hasMessageContaining("请假");
    }

    private ScheduleDetail detail(Long id, Long employeeId) {
        ScheduleDetail detail = new ScheduleDetail();
        detail.setId(id);
        detail.setEmployeeId(employeeId);
        detail.setRecordStatus("active");
        detail.setWorkDate(LocalDate.of(2026, 8, 1));
        detail.setTaskStart(LocalDateTime.of(2026, 8, 1, 8, 0));
        detail.setTaskEnd(LocalDateTime.of(2026, 8, 1, 12, 0));
        return detail;
    }
}
