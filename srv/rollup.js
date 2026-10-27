const cds = require('@sap/cds');

const { SELECT, UPDATE, INSERT } = cds.ql;

async function recalculateProject(tx, projectID) {
    const {
        Projects,
        Employees,
        Tasks,
        Budgets,
        Timesheets,
        TimesheetEntries,
        Alerts
    } = cds.entities('psaa.db');

    // Get the project.
    const project = await tx.run(
        SELECT.one.from(Projects).where({ ID: projectID })
    );

    if (!project) {
        throw new Error(`Project ${projectID} was not found.`);
    }

    // Only approved and invoiced timesheets contribute to calculations.
    const timesheets = await tx.run(
        SELECT.from(Timesheets)
            .columns('ID', 'employee_ID')
            .where({
                project_ID: projectID,
                status: { in: ['APPROVED', 'INVOICED'] }
            })
    );

    const timesheetIDs = timesheets.map(item => item.ID);

    let entries = [];

    if (timesheetIDs.length > 0) {
        entries = await tx.run(
            SELECT.from(TimesheetEntries)
                .columns(
                    'task_ID',
                    'timesheet_ID',
                    'hours',
                    'billable'
                )
                .where({
                    timesheet_ID: { in: timesheetIDs }
                })
        );
    }

    // Map timesheet IDs to employee IDs.
    const employeeByTimesheet = new Map(
        timesheets.map(item => [item.ID, item.employee_ID])
    );

    // Calculate actual hours per task and labor cost per employee.
    const taskHours = new Map();
    const employeeHours = new Map();

    for (const entry of entries) {
        const hours = Number(entry.hours || 0);
        const taskID = entry.task_ID;
        const employeeID = employeeByTimesheet.get(entry.timesheet_ID);

        taskHours.set(
            taskID,
            (taskHours.get(taskID) || 0) + hours
        );

        if (employeeID) {
            employeeHours.set(
                employeeID,
                (employeeHours.get(employeeID) || 0) + hours
            );
        }
    }

    // Update task actual hours.
    const tasks = await tx.run(
        SELECT.from(Tasks)
            .columns('ID')
            .where({ project_ID: projectID })
    );

    for (const task of tasks) {
        await tx.run(
            UPDATE(Tasks)
                .set({
                    actualHours: taskHours.get(task.ID) || 0
                })
                .where({ ID: task.ID })
        );
    }

    // Load employee hourly cost rates.
    const employeeIDs = [...employeeHours.keys()];
    let employees = [];

    if (employeeIDs.length > 0) {
        employees = await tx.run(
            SELECT.from(Employees)
                .columns('ID', 'hourlyCostRate')
                .where({ ID: { in: employeeIDs } })
        );
    }

    const hourlyRateByEmployee = new Map(
        employees.map(employee => [
            employee.ID,
            Number(employee.hourlyCostRate || 0)
        ])
    );

    // Internal labor cost = approved hours × employee hourly cost rate.
    const consumedAmount = Math.round(
        [...employeeHours.entries()].reduce(
            (total, [employeeID, hours]) => {
                const rate = hourlyRateByEmployee.get(employeeID) || 0;
                return total + hours * rate;
            },
            0
        ) * 100
    ) / 100;

    console.log("Employee hours:", [...employeeHours.entries()]);
    console.log("Employee rates:", [...hourlyRateByEmployee.entries()]);

    // Keep client-billable hours separate from internal labor costs.
    const billableHours = entries.reduce((sum, entry) => {
        return entry.billable
            ? sum + Number(entry.hours || 0)
            : sum;
    }, 0);

    // Calculate project-level budget utilization.
    const projectBudget = Number(project.budgetAmount || 0);

    let budgetStatus = 'WITHIN_BUDGET';
    let utilization = 0;

    if (projectBudget > 0) {
        utilization = (consumedAmount / projectBudget) * 100;

        if (utilization >= 100) {
            budgetStatus = 'BREACHED';
        } else if (utilization >= 75) {
            budgetStatus = 'AT_RISK';
        }
    } else if (consumedAmount > 0) {
        budgetStatus = 'BREACHED';
        utilization = 100;
    }

    // Update every budget record belonging to this project.
    const budgets = await tx.run(
        SELECT.from(Budgets)
            .where({ project_ID: projectID })
    );

    for (const budget of budgets) {
        const budgetAmount = Number(budget.budgetAmount || 0);

        let status = 'WITHIN_BUDGET';

        if (budgetAmount > 0) {
            const percentage =
                (consumedAmount / budgetAmount) * 100;

            if (percentage >= 100) {
                status = 'BREACHED';
            } else if (percentage >= 75) {
                status = 'AT_RISK';
            }
        } else if (consumedAmount > 0) {
            status = 'BREACHED';
        }

        await tx.run(
            UPDATE(Budgets)
                .set({
                    consumedAmount,
                    status
                })
                .where({ ID: budget.ID })
        );
    }

    // Generate project-level alerts at 75%, 90% and 100%.
    for (const threshold of [75, 90, 100]) {
        if (utilization < threshold) continue;

        const existing = await tx.run(
            SELECT.one.from(Alerts)
                .columns('ID')
                .where({
                    project_ID: projectID,
                    threshold
                })
        );

        if (!existing) {
            const severity =
                threshold >= 100 ? 'CRITICAL' :
                threshold >= 90 ? 'HIGH' :
                'MEDIUM';

            await tx.run(
                INSERT.into(Alerts).entries({
                    project_ID: projectID,
                    threshold,
                    description:
                        `Project budget utilization has reached ${threshold}%.`,
                    severity,
                    triggeredAt: new Date().toISOString(),
                    acknowledged: false
                })
            );
        }
    }

    return {
        projectID,
        approvedHours: [...employeeHours.values()]
            .reduce((sum, hours) => sum + hours, 0),
        approvedBillableHours: billableHours,
        consumedAmount,
        remainingBudget: Math.max(
            projectBudget - consumedAmount,
            0
        ),
        utilization,
        budgetStatus
    };
}

module.exports = { recalculateProject };
