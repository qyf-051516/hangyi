package com.qyf.hangyi.core.auth.service;

import com.qyf.hangyi.core.auth.entity.RptStaff;
import com.qyf.hangyi.core.auth.entity.Schedule;
import com.qyf.hangyi.core.auth.entity.ScheduleChange;
import com.qyf.hangyi.core.auth.entity.ScheduleDetail;
import com.qyf.hangyi.core.auth.audit.entity.OperationLog;
import com.qyf.hangyi.core.auth.audit.mapper.OperationLogMapper;
import com.qyf.hangyi.core.auth.mapper.*;
import com.qyf.hangyi.core.employee.entity.AircraftType;
import com.qyf.hangyi.core.employee.entity.Employee;
import com.qyf.hangyi.core.employee.entity.EmployeeQualification;
import com.qyf.hangyi.core.employee.entity.TeamGroup;
import com.qyf.hangyi.core.employee.mapper.AircraftTypeMapper;
import com.qyf.hangyi.core.employee.mapper.EmployeeMapper;
import com.qyf.hangyi.core.employee.mapper.EmployeeQualificationMapper;
import com.qyf.hangyi.core.employee.mapper.TeamGroupMapper;
import com.qyf.hangyi.core.employee.leave.entity.LeaveRequest;
import com.qyf.hangyi.core.employee.leave.mapper.LeaveRequestMapper;
import com.qyf.hangyi.core.flight.mapper.FlightPlanMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SyncServiceTest {

    static {
        var assistant = new org.apache.ibatis.builder.MapperBuilderAssistant(
            new com.baomidou.mybatisplus.core.MybatisConfiguration(), "");
        assistant.setCurrentNamespace("syncServiceTest");
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(assistant, ScheduleDetail.class);
    }

    @Mock private EmployeeMapper employeeMapper;
    @Mock private RptStaffMapper rptStaffMapper;
    @Mock private TeamGroupMapper teamGroupMapper;
    @Mock private EmployeeQualificationMapper qualificationMapper;
    @Mock private AircraftTypeMapper aircraftTypeMapper;
    @Mock private RptFlightMapper rptFlightMapper;
    @Mock private RptScheduleMapper rptScheduleMapper;
    @Mock private RptSwapRequestMapper rptSwapRequestMapper;
    @Mock private RptSyncLogMapper rptSyncLogMapper;
    @Mock private FlightPlanMapper flightPlanMapper;
    @Mock private ScheduleDetailMapper scheduleDetailMapper;
    @Mock private ScheduleChangeMapper scheduleChangeMapper;
    @Mock private OperationLogMapper operationLogMapper;
    @Mock private ScheduleMapper scheduleMapper;
    @Mock private LeaveRequestMapper leaveRequestMapper;

    @InjectMocks private SyncService service;

    @Test
    void employeeLookupReturnsMiniProgramBusinessProfile() {
        Employee employee = new Employee();
        employee.setId(11L);
        employee.setEmpNo("GH001");
        employee.setName("张伟");
        employee.setPhone("13800000001");
        employee.setGroupId(7L);
        employee.setStatus(1);
        employee.setPosition("勤务放行");

        TeamGroup group = new TeamGroup();
        group.setId(7L);
        group.setGroupName("A组");

        RptStaff rpt = new RptStaff();
        rpt.setEmployeeNo("GH001");
        rpt.setActive(true);
        rpt.setOnLeave(false);
        rpt.setRoleType("BOTH");
        rpt.setAuthorizedAirlines("[\"中国南方航空\",\"中国东方航空\"]");
        rpt.setAuthorizedAircraftTypes("[\"B737\"]");

        EmployeeQualification qualification = new EmployeeQualification();
        qualification.setEmployeeId(11L);
        qualification.setAircraftTypeId(21L);
        qualification.setQualCode("JX-GH001-A320");
        qualification.setIssueDate(LocalDate.of(2025, 1, 1));
        qualification.setExpireDate(LocalDate.of(2027, 1, 1));
        qualification.setStatus(1);

        AircraftType aircraftType = new AircraftType();
        aircraftType.setId(21L);
        aircraftType.setTypeCode("A320");

        when(employeeMapper.selectList(any())).thenReturn(List.of(employee));
        when(rptStaffMapper.selectList(any())).thenReturn(List.of(rpt));
        when(teamGroupMapper.selectById(7L)).thenReturn(group);
        when(qualificationMapper.selectList(any())).thenReturn(List.of(qualification));
        when(aircraftTypeMapper.selectBatchIds(any())).thenReturn(List.of(aircraftType));

        Map<String, Object> result = service.findEmployeeByEmpNo("GH001");

        assertThat(result)
            .containsEntry("employeeNo", "GH001")
            .containsEntry("groupId", "A组")
            .containsEntry("roleType", "BOTH")
            .containsEntry("active", true);
        assertThat(result.get("authorizedAirlines"))
            .isEqualTo(List.of("中国南方航空", "中国东方航空"));
        assertThat(result.get("authorizedAircraftTypes"))
            .isEqualTo(List.of("A320", "B737"));
        assertThat((List<?>) result.get("qualifications")).hasSize(1);
    }

    @Test
    void employeeLookupReturnsNullWhenEmployeeDoesNotExist() {
        when(employeeMapper.selectList(any())).thenReturn(List.of());

        assertThat(service.findEmployeeByEmpNo("UNKNOWN")).isNull();
    }

    @Test
    void staffSyncSnapshotKeepsAuthorizationAndQualificationJson() throws Exception {
        var method = SyncService.class.getDeclaredMethod("mapRptStaff", Map.class);
        method.setAccessible(true);
        Map<String, Object> source = Map.of(
            "employeeNo", "GH001",
            "name", "张伟",
            "authorizedAirlines", List.of("中国南方航空"),
            "authorizedAircraftTypes", List.of("A320"),
            "qualifications", List.of(Map.of("aircraftType", "A320", "status", "EXPIRING")),
            "preferences", Map.of("preferredShifts", List.of("MORNING"))
        );

        RptStaff result = (RptStaff) method.invoke(service, source);

        assertThat(result.getAuthorizedAirlines()).isEqualTo("[\"中国南方航空\"]");
        assertThat(result.getAuthorizedAircraftTypes()).isEqualTo("[\"A320\"]");
        assertThat(result.getQualifications()).contains("\"status\":\"EXPIRING\"");
        assertThat(result.getPreferences()).contains("\"preferredShifts\":[\"MORNING\"]");
    }

    @Test
    void approvedLeaveDoesNotTurnActiveEmployeeIntoFormerEmployee() throws Exception {
        Employee employee = new Employee();
        employee.setId(11L);
        employee.setEmpNo("GH001");
        when(employeeMapper.selectList(any())).thenReturn(List.of(employee));
        var method = SyncService.class.getDeclaredMethod(
            "upsertEmployee", Map.class, String.class, Map.class);
        method.setAccessible(true);

        method.invoke(service, Map.of(
            "employeeNo", "GH001",
            "name", "张伟",
            "phone", "13800000001",
            "groupId", "A组",
            "active", true,
            "onLeave", true
        ), "GH001", Map.of("A组", 7L));

        ArgumentCaptor<Employee> employeeCaptor = ArgumentCaptor.forClass(Employee.class);
        verify(employeeMapper).updateById(employeeCaptor.capture());
        assertThat(employeeCaptor.getValue().getStatus()).isEqualTo(1);
    }

    @Test
    void afternoonShiftMapsToJavaAfternoonTemplate() throws Exception {
        var method = SyncService.class.getDeclaredMethod("mapShiftCode", String.class);
        method.setAccessible(true);

        assertThat(method.invoke(service, "AFTERNOON")).isEqualTo(2L);
        assertThat(method.invoke(service, "EVENING")).isEqualTo(2L);
    }

    @Test
    void scheduleSyncUsesCloudIdAndPropagatesArchivedStatusForAdminSchedule() {
        Employee employee = new Employee();
        employee.setId(11L);
        employee.setEmpNo("GH001");
        when(employeeMapper.selectList(any())).thenReturn(List.of(employee));

        Schedule master = new Schedule();
        master.setId(21L);
        when(scheduleMapper.selectList(any())).thenReturn(List.of(master));
        ScheduleDetail existing = new ScheduleDetail();
        existing.setId(31L);
        when(scheduleDetailMapper.selectList(any())).thenReturn(List.of(existing));

        int count = service.syncSchedules(List.of(Map.of(
            "_id", "cloud-schedule-id",
            "flightNo", "ADMIN-20260803",
            "scheduleDate", "2026-08-03",
            "shiftCode", "AFTERNOON",
            "staffId", "cloud-staff-id",
            "staffEmployeeNo", "GH001",
            "recordStatus", "archived",
            "status", "ASSIGNED"
        )));

        assertThat(count).isEqualTo(1);
        ArgumentCaptor<ScheduleDetail> captor = ArgumentCaptor.forClass(ScheduleDetail.class);
        verify(scheduleDetailMapper).updateById(captor.capture());
        assertThat(captor.getValue().getSourceKey()).isEqualTo("WX:cloud-schedule-id");
        assertThat(captor.getValue().getEmployeeId()).isEqualTo(11L);
        assertThat(captor.getValue().getShiftId()).isEqualTo(2L);
        assertThat(captor.getValue().getRecordStatus()).isEqualTo("archived");
        assertThat(captor.getValue().getFlightId()).isNull();
        verify(flightPlanMapper, never()).selectList(any());
    }

    @Test
    void swapSyncResolvesCloudScheduleIdAndKeepsCancelledStatus() {
        Employee employee = new Employee();
        employee.setId(11L);
        employee.setEmpNo("GH001");
        when(employeeMapper.selectList(any())).thenReturn(List.of(employee));

        ScheduleDetail source = new ScheduleDetail();
        source.setId(41L);
        source.setEmployeeId(11L);
        source.setWorkDate(LocalDate.of(2026, 8, 3));
        source.setShiftId(2L);
        when(scheduleDetailMapper.selectList(any())).thenReturn(List.of(source));

        int count = service.syncSwapRequests(List.of(Map.of(
            "_id", "cloud-swap-id",
            "requestType", "SHIFT_APPLY",
            "sourceScheduleId", "cloud-schedule-id",
            "employeeNo", "GH001",
            "scheduleDate", "2026-08-03",
            "status", "CANCELLED",
            "reason", "个人原因"
        )));

        assertThat(count).isEqualTo(1);
        ArgumentCaptor<ScheduleChange> captor = ArgumentCaptor.forClass(ScheduleChange.class);
        verify(scheduleChangeMapper).insert(captor.capture());
        assertThat(captor.getValue().getSourceScheduleSourceId()).isEqualTo("cloud-schedule-id");
        assertThat(captor.getValue().getScheduleDetailId()).isEqualTo(41L);
        assertThat(captor.getValue().getStatus()).isEqualTo(3);
    }

    @Test
    void leaveSyncIsIdempotentAndPreservesEvidence() {
        Employee employee = new Employee();
        employee.setId(11L);
        employee.setEmpNo("GH001");
        when(employeeMapper.selectList(any())).thenReturn(List.of(employee));
        LeaveRequest existing = new LeaveRequest();
        existing.setId(51L);
        when(leaveRequestMapper.selectList(any())).thenReturn(List.of(existing));

        int count = service.syncLeaveRequests(List.of(Map.ofEntries(
            Map.entry("_id", "cloud-leave-id"),
            Map.entry("employeeNo", "GH001"),
            Map.entry("type", "ANNUAL"),
            Map.entry("startDate", "2026-08-03"),
            Map.entry("endDate", "2026-08-05"),
            Map.entry("reason", "休假"),
            Map.entry("reasonMode", "MIXED"),
            Map.entry("reasonImages", List.of("cloud://evidence.jpg")),
            Map.entry("validationSnapshot", Map.of("passed", true)),
            Map.entry("status", "CANCELLED"),
            Map.entry("cancelledAt", "2026-08-02T10:00:00")
        )));

        assertThat(count).isEqualTo(1);
        ArgumentCaptor<LeaveRequest> captor = ArgumentCaptor.forClass(LeaveRequest.class);
        verify(leaveRequestMapper).updateById(captor.capture());
        assertThat(captor.getValue().getSourceRequestId()).isEqualTo("cloud-leave-id");
        assertThat(captor.getValue().getTotalDays()).isEqualByComparingTo("3");
        assertThat(captor.getValue().getReasonImages()).contains("cloud://evidence.jpg");
        assertThat(captor.getValue().getValidationSnapshot()).contains("\"passed\":true");
        assertThat(captor.getValue().getStatus()).isEqualTo(3);
    }

    @Test
    void operationLogSyncUpdatesBySourceIdAndStoresStructuredTargetAsJson() {
        OperationLog existing = new OperationLog();
        existing.setId(61L);
        when(operationLogMapper.selectList(any())).thenReturn(List.of(existing));

        int count = service.syncOperationLogs(List.of(Map.of(
            "_id", "cloud-log-id",
            "action", "PUBLISH_SCHEDULE",
            "detail", "发布排班",
            "target", Map.of("scheduleDate", "2026-08-03", "count", 63),
            "createdAt", "2026-08-03T10:00:00"
        )));

        assertThat(count).isEqualTo(1);
        ArgumentCaptor<OperationLog> captor = ArgumentCaptor.forClass(OperationLog.class);
        verify(operationLogMapper).updateById(captor.capture());
        assertThat(captor.getValue().getSourceId()).isEqualTo("cloud-log-id");
        assertThat(captor.getValue().getTargetId()).contains("\"scheduleDate\":\"2026-08-03\"");
    }

    @Test
    void staffSyncCreatesMissingWechatGroupAndMapsSolverLicense() {
        when(teamGroupMapper.selectList(any())).thenReturn(List.of());
        doAnswer(invocation -> {
            TeamGroup group = invocation.getArgument(0);
            group.setId("A组".equals(group.getGroupName()) ? 71L : 72L);
            return 1;
        }).when(teamGroupMapper).insert(any(TeamGroup.class));
        when(employeeMapper.selectList(any())).thenReturn(List.of());
        doAnswer(invocation -> {
            Employee employee = invocation.getArgument(0);
            employee.setId(81L);
            return 1;
        }).when(employeeMapper).insert(any(Employee.class));

        service.syncStaff(List.of(Map.of(
            "_id", "cloud-staff-id",
            "employeeNo", "GH001",
            "name", "张伟",
            "groupId", "A组",
            "active", true,
            "roleType", "BOTH",
            "authorizedAirlines", List.of("中国南方航空"),
            "authorizedAircraftTypes", List.of("A320")
        )));

        ArgumentCaptor<Employee> captor = ArgumentCaptor.forClass(Employee.class);
        verify(employeeMapper).insert(captor.capture());
        assertThat(captor.getValue().getGroupId()).isEqualTo(71L);
        assertThat(captor.getValue().getRoleType()).isEqualTo("BOTH");
        assertThat(captor.getValue().getLicenseType()).isEqualTo("TA");
        assertThat(captor.getValue().getAuthorizedAircraftTypes()).isEqualTo("[\"A320\"]");
    }

    @Test
    void flightSnapshotPreservesEngineRegistrationAndEstimatedArrival() throws Exception {
        var method = SyncService.class.getDeclaredMethod("mapRptFlight", Map.class);
        method.setAccessible(true);

        Object result = method.invoke(service, Map.of(
            "_id", "cloud-flight-id",
            "flightNo", "CZ3101",
            "scheduleDate", "2026-08-03",
            "aircraftType", "A320",
            "engineModel", "CFM56-5B",
            "aircraftRegistration", "B-1234",
            "estimatedArrivalTime", "2026-08-03T12:30:00"
        ));

        assertThat(result).extracting("engineModel", "aircraftRegistration", "estimatedArrivalTime")
            .containsExactly("CFM56-5B", "B-1234", "2026-08-03T12:30:00");
    }
}
