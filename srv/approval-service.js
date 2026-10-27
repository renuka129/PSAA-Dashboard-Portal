const cds = require("@sap/cds");

const { SELECT, UPDATE, INSERT } = cds.ql;

module.exports = function () {
    const {
        Timesheets,
        Employees,
        TimesheetApprovalHistory
    } = cds.entities("psaa.db");

    const { recalculateProject } = require("./rollup");

    // Resolve the manager from the authenticated CAP user.
    const resolveApprover = async (req, tx) => {
    // TEMPORARY: Bypass authentication and manager checks for local testing.
    // Do not use this version in production.

    const employees = await tx.run(
        SELECT.from(Employees)
            .columns("ID", "designation", "email")
            .limit(1)
    );

    if (!employees || employees.length === 0) {
        return req.reject(400, "No employee records found.");
    }

    console.log(
        "TEMPORARY APPROVER:",
        employees[0].ID,
        employees[0].designation
    );

    return employees[0];
};

    // Write an approval-history record.
    const recordHistory = async (
        tx,
        timesheetID,
        approverID,
        action,
        comments
    ) => {
        await tx.run(
            INSERT.into(TimesheetApprovalHistory).entries({
                timesheet_ID: timesheetID,
                action: action,
                performedBy_ID: approverID,
                actionAt: new Date().toISOString(),
                comments: comments || null
            })
        );
    };

    // APPROVE TIMESHEET
    this.on("approveTimesheet", async (req) => {
        const tx = cds.tx(req);
        const { timesheetID } = req.data;

        if (!timesheetID) {
            return req.reject(
                400,
                "Timesheet ID is required."
            );
        }

        const timesheet = await tx.run(
            SELECT.one.from(Timesheets)
                .where({ ID: timesheetID })
        );

        if (!timesheet) {
            return req.reject(
                404,
                "Timesheet not found."
            );
        }

        if (timesheet.status !== "SUBMITTED") {
            return req.reject(
                409,
                "Only submitted timesheets can be approved."
            );
        }

        const approver = await resolveApprover(req, tx);

        await tx.run(
            UPDATE(Timesheets)
                .set({
                    status: "APPROVED",
                    approver_ID: approver.ID,
                    approvedAt: new Date().toISOString(),
                    rejectionReason: null
                })
                .where({ ID: timesheetID })
        );

        // Save the approval history in the same request transaction.
        await recordHistory(
            tx,
            timesheetID,
            approver.ID,
            "APPROVED",
            null
        );

        // Recalculate project actual hours and budget consumption.
        // Recalculate project actual hours and budget consumption.
console.log("Approved timesheet ID:", timesheetID);
console.log("Project ID:", timesheet.project_ID);

const result = await recalculateProject(
    tx,
    timesheet.project_ID
);

console.log("Budget recalculation result:", result);

return true;
    });

    // REJECT TIMESHEET
    this.on("rejectTimesheet", async (req) => {
        const tx = cds.tx(req);
        const { timesheetID, reason } = req.data;

        if (!timesheetID) {
            return req.reject(
                400,
                "Timesheet ID is required."
            );
        }

        if (
            typeof reason !== "string" ||
            !reason.trim()
        ) {
            return req.reject(
                400,
                "A rejection reason is required."
            );
        }

        const trimmedReason = reason.trim();

        if (trimmedReason.length > 500) {
            return req.reject(
                400,
                "The rejection reason cannot exceed 500 characters."
            );
        }

        const timesheet = await tx.run(
            SELECT.one.from(Timesheets)
                .where({ ID: timesheetID })
        );

        if (!timesheet) {
            return req.reject(
                404,
                "Timesheet not found."
            );
        }

        if (timesheet.status !== "SUBMITTED") {
            return req.reject(
                409,
                "Only submitted timesheets can be rejected."
            );
        }

        const approver = await resolveApprover(req, tx);

        await tx.run(
            UPDATE(Timesheets)
                .set({
                    status: "REJECTED",
                    approver_ID: approver.ID,
                    rejectionReason: trimmedReason,
                    approvedAt: null
                })
                .where({ ID: timesheetID })
        );

        // Save the rejection reason and manager in the history.
        await recordHistory(
            tx,
            timesheetID,
            approver.ID,
            "REJECTED",
            trimmedReason
        );

        return true;
    });
};