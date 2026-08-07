package com.qyf.hangyi.core.employee.leave.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.common.sync.GuochuangSyncClient;
import com.qyf.hangyi.core.auth.entity.ScheduleDetail;
import com.qyf.hangyi.core.auth.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.core.employee.entity.Employee;
import com.qyf.hangyi.core.employee.leave.dto.CreateLeaveRequest;
import com.qyf.hangyi.core.employee.leave.entity.LeaveRequest;
import com.qyf.hangyi.core.employee.leave.mapper.LeaveRequestMapper;
import com.qyf.hangyi.core.employee.mapper.EmployeeMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class LeaveRequestServiceTest {

    private LeaveRequestMapper leaveMapper;
    private EmployeeMapper employeeMapper;
    private ScheduleDetailMapper scheduleDetailMapper;
    private GuochuangSyncClient syncClient;
    private LeaveRequestService service;

    @BeforeAll
    static void initializeMyBatisMetadata() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        assistant.setCurrentNamespace("leaveRequestServiceTest");
        TableInfoHelper.initTableInfo(assistant, LeaveRequest.class);
        TableInfoHelper.initTableInfo(assistant, Employee.class);
        TableInfoHelper.initTableInfo(assistant, ScheduleDetail.class);
    }

    @BeforeEach
    void setUp() {
        leaveMapper = mock(LeaveRequestMapper.class);
        employeeMapper = mock(EmployeeMapper.class);
        scheduleDetailMapper = mock(ScheduleDetailMapper.class);
        syncClient = mock(GuochuangSyncClient.class);
        service = new LeaveRequestService(
                leaveMapper, employeeMapper, scheduleDetailMapper, syncClient, new ObjectMapper());
    }

    @Test
    void employeeIdentityIsDerivedAndImageEvidenceIsPersisted() {
        Employee employee = employee(11L, 99L);
        when(employeeMapper.selectList(any())).thenReturn(List.of(employee));
        when(employeeMapper.lockActiveById(11L)).thenReturn(employee);
        when(leaveMapper.selectCount(any())).thenReturn(0L);
        doAnswer(invocation -> {
            LeaveRequest leave = invocation.getArgument(0);
            leave.setId(7L);
            return 1;
        }).when(leaveMapper).insert(any(LeaveRequest.class));

        LeaveRequest saved = service.create(99L, false, new CreateLeaveRequest(
                888L,
                "ANNUAL",
                LocalDate.of(2026, 8, 3),
                LocalDate.of(2026, 8, 4),
                "",
                "IMAGE",
                List.of("cloud://evidence/leave-1.jpg")
        ));

        assertThat(saved.getEmployeeId()).isEqualTo(11L);
        assertThat(saved.getTotalDays()).isEqualByComparingTo("2");
        assertThat(saved.getReasonMode()).isEqualTo("IMAGE");
        assertThat(saved.getReasonImages()).contains("leave-1.jpg");
        verify(employeeMapper).lockActiveById(11L);
        verify(syncClient).enqueuePush(eq("leave_requests"), any());
    }

    @Test
    void overlappingRequestIsRejected() {
        Employee employee = employee(11L, 99L);
        when(employeeMapper.selectList(any())).thenReturn(List.of(employee));
        when(employeeMapper.lockActiveById(11L)).thenReturn(employee);
        when(leaveMapper.selectCount(any())).thenReturn(1L);

        assertThatThrownBy(() -> service.create(99L, false, new CreateLeaveRequest(
                null, "SICK", LocalDate.of(2026, 8, 3), null,
                "身体不适", "TEXT", List.of()
        ))).isInstanceOf(BusinessException.class).hasMessageContaining("已有");
    }

    @Test
    void approvalUsesAtomicPendingTransition() {
        when(leaveMapper.update(any(), any())).thenReturn(0);

        assertThatThrownBy(() -> service.approve(99L, 7L, 1, "同意"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("已被其他审批人处理");
    }

    @Test
    void approvedLeaveMarksActiveSchedulesForReassignment() {
        LeaveRequest leave = new LeaveRequest();
        leave.setId(7L);
        leave.setEmployeeId(11L);
        leave.setStartDate(LocalDate.of(2026, 8, 3));
        leave.setEndDate(LocalDate.of(2026, 8, 4));
        leave.setStatus(1);
        when(leaveMapper.update(any(), any())).thenReturn(1);
        when(leaveMapper.selectById(7L)).thenReturn(leave);

        service.approve(99L, 7L, 1, "同意");

        verify(scheduleDetailMapper).update(any(), any());
        verify(syncClient).enqueuePush(eq("leave_requests"), any());
    }

    @Test
    void onlyOwnerCanWithdrawPendingRequest() {
        when(employeeMapper.selectList(any())).thenReturn(List.of(employee(11L, 99L)));
        when(leaveMapper.update(any(), any())).thenReturn(0);

        assertThatThrownBy(() -> service.withdraw(99L, 7L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("不属于当前员工");
    }

    private Employee employee(Long employeeId, Long userId) {
        Employee employee = new Employee();
        employee.setId(employeeId);
        employee.setUserId(userId);
        employee.setStatus(1);
        return employee;
    }
}
