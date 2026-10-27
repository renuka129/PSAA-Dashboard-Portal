const cds = require('@sap/cds');

const { SELECT, INSERT, UPDATE, DELETE } = cds.ql;

module.exports = function () {
    const { Timesheets, TimesheetEntries, Employees, Tasks } =
        cds.entities('psaa.db');

    // Return a date as YYYY-MM-DD.
    function dateString(value) {
        if (!value) return '';
        return String(value).slice(0, 10);
    }

    // Calculate the Monday and Sunday for a given date.
    function getWeek(dateValue) {
        const date = new Date(`${dateString(dateValue)}T00:00:00Z`);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        const day = date.getUTCDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;

        const monday = new Date(date);
        monday.setUTCDate(date.getUTCDate() + mondayOffset);

        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);

        return {
            start: monday.toISOString().slice(0, 10),
            end: sunday.toISOString().slice(0, 10)
        };
    }

    // Recalculate a timesheet's total from its entries.
    async function recalculateTotal(tx, timesheetID) {
        const entries = await tx.run(
            SELECT.from(TimesheetEntries)
                .columns('hours')
                .where({ timesheet_ID: timesheetID })
        );

        const total = entries.reduce(
            (sum, entry) => sum + Number(entry.hours || 0),
            0
        );

        await tx.run(
            UPDATE(Timesheets)
                .set({ totalHours: total })
                .where({ ID: timesheetID })
        );

        return total;
    }

    // Ensure an entry belongs to an editable timesheet.
    async function getEditableTimesheet(tx, timesheetID) {
        const timesheet = await tx.run(
            SELECT.one.from(Timesheets)
                .where({ ID: timesheetID })
        );

        if (!timesheet) {
            return { error: 'Timesheet not found.' };
        }

        if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
            return {
                error: 'Only Draft or Rejected timesheets can be edited.'
            };
        }

        return { timesheet };
    }

    // Validate a single entry.
    async function validateEntry(tx, entry, timesheet) {
        const hours = Number(entry.hours);

        if (!Number.isFinite(hours) || hours < 0.25 || hours > 24) {
            return 'Entry hours must be between 0.25 and 24.';
        }

        // Hours must be in increments of 0.25.
        if (Math.abs(hours * 4 - Math.round(hours * 4)) > 0.000001) {
            return 'Entry hours must use increments of 0.25.';
        }

        const workDate = dateString(entry.workDate);
        const weekStart = dateString(timesheet.weekStart);
        const weekEnd = dateString(timesheet.weekEnd);

        if (!workDate || workDate < weekStart || workDate > weekEnd) {
            return 'The work date must fall within the timesheet week.';
        }

        const taskID = entry.task_ID || entry.task?.ID;

        if (!taskID) {
            return 'A task is required for every timesheet entry.';
        }

        const task = await tx.run(
            SELECT.one.from(Tasks)
                .columns('ID', 'status', 'project_ID')
                .where({ ID: taskID })
        );

        if (!task) {
            return 'The selected task does not exist.';
        }

        if (task.status === 'DONE') {
            return 'A completed task cannot receive new timesheet entries.';
        }

        if (task.project_ID !== timesheet.project_ID) {
            return 'The selected task must belong to the timesheet project.';
        }

        return null;
    }

    // Validate timesheet dates and uniqueness.
    this.before('CREATE', 'Timesheets', async (req) => {
        const tx = cds.tx(req);

        if (!req.data.employee_ID || !req.data.project_ID) {
            return req.reject(
                400,
                'Employee and project are required.'
            );
        }

        const weekStart = dateString(req.data.weekStart);
        const weekEnd = dateString(req.data.weekEnd);

        if (!weekStart || !weekEnd) {
            return req.reject(
                400,
                'Week start and week end are required.'
            );
        }

        const expectedWeek = getWeek(weekStart);

        if (
            !expectedWeek ||
            expectedWeek.start !== weekStart ||
            expectedWeek.end !== weekEnd
        ) {
            return req.reject(
                400,
                'The timesheet week must run from Monday through Sunday.'
            );
        }

        const employee = await tx.run(
            SELECT.one.from(Employees)
                .columns('ID')
                .where({ ID: req.data.employee_ID })
        );

        if (!employee) {
            return req.reject(400, 'Employee not found.');
        }

        const duplicate = await tx.run(
            SELECT.one.from(Timesheets)
                .columns('ID')
                .where({
                    employee_ID: req.data.employee_ID,
                    project_ID: req.data.project_ID,
                    weekStart
                })
        );

        if (duplicate) {
            return req.reject(
                409,
                'A timesheet already exists for this employee, project and week.'
            );
        }

        req.data.status = 'DRAFT';
        req.data.totalHours = 0;
    });

    // Prevent changes to locked timesheets.
    this.before('UPDATE', 'Timesheets', async (req) => {
        const tx = cds.tx(req);

        const existing = await tx.run(
            SELECT.one.from(Timesheets)
                .where({ ID: req.data.ID })
        );

        if (!existing) {
            return req.reject(404, 'Timesheet not found.');
        }

        if (!['DRAFT', 'REJECTED'].includes(existing.status)) {
            return req.reject(
                409,
                'Only Draft or Rejected timesheets can be edited.'
            );
        }

        // The workflow, not a generic update, controls these fields.
        delete req.data.status;
        delete req.data.totalHours;
        delete req.data.submittedAt;
        delete req.data.approvedAt;
        delete req.data.approver_ID;
    });

    // Validate entries before creating them.
    this.before('CREATE', 'TimesheetEntries', async (req) => {
        const tx = cds.tx(req);

        const timesheetID =
            req.data.timesheet_ID || req.data.timesheet?.ID;

        if (!timesheetID) {
            return req.reject(400, 'A timesheet is required.');
        }

        const result = await getEditableTimesheet(tx, timesheetID);

        if (result.error) {
            return req.reject(400, result.error);
        }

        const error = await validateEntry(tx, req.data, result.timesheet);

        if (error) {
            return req.reject(400, error);
        }

        const workDate = dateString(req.data.workDate);

        const existingEntries = await tx.run(
            SELECT.from(TimesheetEntries)
                .columns('ID', 'task_ID', 'workDate', 'hours')
                .where({ timesheet_ID: timesheetID })
        );

        const duplicate = existingEntries.some(
            (entry) =>
                entry.task_ID === (req.data.task_ID || req.data.task?.ID) &&
                dateString(entry.workDate) === workDate
        );

        if (duplicate) {
            return req.reject(
                409,
                'Only one entry per task per day is allowed in a timesheet.'
            );
        }

        const dailyTotal = existingEntries
            .filter((entry) => dateString(entry.workDate) === workDate)
            .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);

        if (dailyTotal + Number(req.data.hours) > 24) {
            return req.reject(
                400,
                'Total hours for a day cannot exceed 24.'
            );
        }
    });

    // Validate updates to existing entries.
    this.before('UPDATE', 'TimesheetEntries', async (req) => {
        const tx = cds.tx(req);

        const existing = await tx.run(
            SELECT.one.from(TimesheetEntries)
                .where({ ID: req.data.ID })
        );

        if (!existing) {
            return req.reject(404, 'Timesheet entry not found.');
        }

        const timesheetID =
            existing.timesheet_ID ||
            req.data.timesheet_ID;

        const result = await getEditableTimesheet(tx, timesheetID);

        if (result.error) {
            return req.reject(400, result.error);
        }

        const candidate = {
            ...existing,
            ...req.data,
            task_ID: req.data.task_ID || existing.task_ID,
            workDate: req.data.workDate || existing.workDate,
            hours: req.data.hours ?? existing.hours
        };

        const error = await validateEntry(
            tx,
            candidate,
            result.timesheet
        );

        if (error) {
            return req.reject(400, error);
        }

        // Do not allow moving an entry to a different timesheet here.
        delete req.data.timesheet_ID;
    });

    // Prevent deleting entries from submitted or approved timesheets.
    this.before('DELETE', 'TimesheetEntries', async (req) => {
        const tx = cds.tx(req);

        const existing = await tx.run(
            SELECT.one.from(TimesheetEntries)
                .where({ ID: req.data.ID })
        );

        if (!existing) return;

        const result = await getEditableTimesheet(
            tx,
            existing.timesheet_ID
        );
        req._timesheetID = existing.timesheet_ID;

        if (result.error) {
            return req.reject(409, result.error);
        }
    });

    // Keep totalHours synchronized after entry changes.
    this.after(['CREATE', 'UPDATE', 'DELETE'], 'TimesheetEntries',
        async (_, req) => {
            const tx = cds.tx(req);

            let timesheetID;

            if (req.event === 'CREATE') {
                timesheetID =
                    req.data.timesheet_ID || req.data.timesheet?.ID;
            } else if (req.event === 'UPDATE') {
                const entry = await tx.run(
                    SELECT.one.from(TimesheetEntries)
                        .where({ ID: req.data.ID })
                );

                timesheetID = entry?.timesheet_ID;
            } else {
                // The row may already be deleted; req.data may contain
                // the entry ID only. See note below about delete totals.
                timesheetID = req.__timesheetID;
            }

            if (timesheetID) {
                await recalculateTotal(tx, timesheetID);
            }
        }
    );

    // Submit a timesheet for manager approval.
    this.on('submitTimesheet', async (req) => {
        const tx = cds.tx(req);
        const { timesheetID } = req.data;

        const timesheet = await tx.run(
            SELECT.one.from(Timesheets)
                .where({ ID: timesheetID })
        );

        if (!timesheet) {
            return req.reject(404, 'Timesheet not found.');
        }

        if (!['DRAFT', 'REJECTED'].includes(timesheet.status)) {
            return req.reject(
                409,
                'Only Draft or Rejected timesheets can be submitted.'
            );
        }

        const entries = await tx.run(
            SELECT.from(TimesheetEntries)
                .where({ timesheet_ID: timesheetID })
        );

        if (!entries.length) {
            return req.reject(
                400,
                'Add at least one entry before submitting.'
            );
        }

        const dailyTotals = new Map();
        let totalHours = 0;

        for (const entry of entries) {
            const error = await validateEntry(tx, entry, timesheet);

            if (error) {
                return req.reject(400, error);
            }

            const date = dateString(entry.workDate);
            const hours = Number(entry.hours);

            dailyTotals.set(
                date,
                (dailyTotals.get(date) || 0) + hours
            );

            totalHours += hours;
        }

        for (const hours of dailyTotals.values()) {
            if (hours > 24) {
                return req.reject(
                    400,
                    'Daily working hours cannot exceed 24.'
                );
            }
        }

        await tx.run(
            UPDATE(Timesheets)
                .set({
                    status: 'SUBMITTED',
                    totalHours,
                    submittedAt: new Date().toISOString(),
                    rejectionReason: null
                })
                .where({ ID: timesheetID })
        );

        return true;
    });
};