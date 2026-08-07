package com.qyf.hangyi.core.flight.service;

import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.core.flight.entity.FlightPlan;
import com.qyf.hangyi.core.flight.mapper.FlightPlanMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * 航班计划同步服务
 *
 * 模拟对接机场航班数据接口（真实场景可替换为对接：
 * - 机场 AODB 系统
 * - 中航信 API
 * - 航空公司运控系统
 *
 * 可通过定时任务自动同步，也可手动触发
 */
@Service
public class FlightSyncService {

    private static final Logger log = LoggerFactory.getLogger(FlightSyncService.class);

    @Autowired
    private FlightPlanMapper flightPlanMapper;

    @Value("${flight.sync.simulation-enabled:false}")
    private boolean simulationEnabled;

    @Value("${flight.sync.auto-enabled:false}")
    private boolean autoEnabled;

    private final Random random = new Random();

    // 模拟航班前缀分配
    private static final String[][] ROUTES = {
            {"CZ", "CAN", "PEK", "广州", "北京"},
            {"CZ", "CAN", "SHA", "广州", "上海"},
            {"CZ", "CAN", "CTU", "广州", "成都"},
            {"CZ", "CAN", "KWL", "广州", "桂林"},
            {"CZ", "CAN", "NNG", "广州", "南宁"},
            {"CZ", "CAN", "HAK", "广州", "海口"},
            {"CZ", "CAN", "KMG", "广州", "昆明"},
            {"CA", "PEK", "CAN", "北京", "广州"},
            {"CA", "PEK", "KWL", "北京", "桂林"},
            {"CA", "PEK", "NNG", "北京", "南宁"},
            {"MU", "SHA", "CAN", "上海", "广州"},
            {"MU", "SHA", "KWL", "上海", "桂林"},
            {"3U", "CTU", "CAN", "成都", "广州"},
            {"MF", "XMN", "CAN", "厦门", "广州"},
            {"ZH", "SZX", "KWL", "深圳", "桂林"},
    };

    // 模拟机型
    private static final String[][] AIRCRAFT_TYPES = {
            {"1", "B737", "波音 737"},
            {"3", "B787", "波音 787"},
            {"4", "A320", "空客 A320"},
            {"5", "A330", "空客 A330"},
            {"7", "E190", "巴航工业 E190"},
    };

    // 模拟机号
    private static final String[] REGISTRATIONS = {
            "B-1234", "B-5678", "B-9012", "B-3456", "B-7890",
            "B-2345", "B-6789", "B-0123"
    };

    /**
     * 手动同步：拉取指定日期的航班数据
     */
    @Transactional(rollbackFor = Exception.class)
    public int syncFlights(LocalDate date) {
        log.info("开始同步航班数据，日期: {}", date);
        List<FlightPlan> flights = fetchFlightsFromAPI(date);

        // M-14: 改用 upsert（按 flight_no+plan_date+plan_time 判定唯一性），
        // 避免 delete+insert 抹掉手工标记的 CANCELLED 等状态。
        // 用 INSERT ... ON DUPLICATE KEY UPDATE（依赖后续 migration 加的
        // uk_flight_unique (flight_no, plan_date, plan_time) 唯一键）
        int count = 0;
        for (FlightPlan flight : flights) {
            // 简单实现：先按 (flight_no, plan_date, plan_time) 查存在则 update，否则 insert
            FlightPlan exist = flightPlanMapper.selectOne(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<FlightPlan>()
                    .eq(FlightPlan::getFlightNo, flight.getFlightNo())
                    .eq(FlightPlan::getPlanDate, flight.getPlanDate())
                    .eq(FlightPlan::getPlanTime, flight.getPlanTime()));
            if (exist != null) {
                // 已存在只更新非状态字段（保留 status 如人工 CANCELLED）
                exist.setRegistration(flight.getRegistration());
                exist.setGate(flight.getGate());
                exist.setRouteFrom(flight.getRouteFrom());
                exist.setRouteTo(flight.getRouteTo());
                exist.setAircraftTypeId(flight.getAircraftTypeId());
                exist.setAircraftTypeName(flight.getAircraftTypeName());
                exist.setAirline(flight.getAirline());
                exist.setFlightType(flight.getFlightType());
                flightPlanMapper.updateById(exist);
            } else {
                flightPlanMapper.insert(flight);
            }
            count++;
        }

        log.info("航班同步完成，日期: {}, 共 {} 条", date, count);
        return count;
    }

    /**
     * 模拟调用外部航班 API
     * 真实场景替换为 HTTP 调用：
     *
     *  @Value("${flight.api.url}")
     *  private String apiUrl;
     *
     *  public List<FlightPlan> fetchFromApi(LocalDate date) {
     *      RestTemplate rest = new RestTemplate();
     *      ResponseEntity<FlightApiResponse> resp = rest.exchange(
     *          apiUrl + "?date=" + date,
     *          HttpMethod.GET, null, FlightApiResponse.class);
     *      return convertApiResponse(resp.getBody());
     *  }
     */
    private List<FlightPlan> fetchFlightsFromAPI(LocalDate date) {
        if (!simulationEnabled) {
            throw new BusinessException(503,
                    "航班同步尚未配置真实数据源；如需演示数据，请显式启用 flight.sync.simulation-enabled");
        }
        List<FlightPlan> list = new ArrayList<>();
        int flightCount = 30 + random.nextInt(20); // 每天 30~50 个航班

        // 确保至少用到一个航班前缀
        int routeIdx = 0;

        for (int i = 0; i < flightCount; i++) {
            routeIdx = random.nextInt(ROUTES.length);
            String[] route = ROUTES[routeIdx];
            String[] aircraft = AIRCRAFT_TYPES[random.nextInt(AIRCRAFT_TYPES.length)];

            // 每个航班生成出港和进港
            FlightPlan dep = new FlightPlan();
            dep.setFlightNo(route[0] + String.format("%04d", 3000 + random.nextInt(2000)));
            dep.setPlanDate(date);
            dep.setPlanTime(LocalTime.of(6 + random.nextInt(16), random.nextInt(60)));
            dep.setFlightType("DEP");
            dep.setRouteFrom(route[3]);
            dep.setRouteTo(route[4]);
            dep.setAirline(route[0]);
            dep.setAircraftTypeId(Long.valueOf(aircraft[0]));
            dep.setAircraftTypeName(aircraft[2]);
            dep.setRegistration(REGISTRATIONS[random.nextInt(REGISTRATIONS.length)]);
            dep.setGate(String.format("%02d", 1 + random.nextInt(25)));
            dep.setStatus("SCHEDULED");
            list.add(dep);

            // 进港航班（时间错开）
            FlightPlan arr = new FlightPlan();
            arr.setFlightNo(dep.getFlightNo());
            arr.setPlanDate(date);
            arr.setPlanTime(dep.getPlanTime().plusHours(2 + random.nextInt(4)));
            arr.setFlightType("ARR");
            arr.setRouteFrom(route[4]);
            arr.setRouteTo(route[3]);
            arr.setAirline(route[0]);
            arr.setAircraftTypeId(dep.getAircraftTypeId());
            arr.setAircraftTypeName(dep.getAircraftTypeName());
            arr.setRegistration(dep.getRegistration());
            arr.setGate(dep.getGate());
            arr.setStatus("SCHEDULED");
            list.add(arr);
        }

        return list;
    }

    /**
     * 自动同步：每天凌晨 3:00 同步当天航班
     */
    @Scheduled(cron = "0 0 3 * * ?")
    public void autoSync() {
        if (!autoEnabled) {
            return;
        }
        log.info("定时任务：自动同步今日航班");
        syncFlights(LocalDate.now());
    }
}
