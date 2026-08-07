package com.qyf.hangyi.core.employee.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.qyf.hangyi.core.employee.entity.Employee;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface EmployeeMapper extends BaseMapper<Employee> {

    /**
     * 串行化同一员工的请假创建。MySQL/InnoDB 行锁让“查重 + 插入”处于同一
     * 临界区，避免两个并发请求同时通过重叠日期检查。
     */
    @Select("SELECT * FROM employee WHERE id = #{employeeId} AND status = 1 FOR UPDATE")
    Employee lockActiveById(@Param("employeeId") Long employeeId);
}
