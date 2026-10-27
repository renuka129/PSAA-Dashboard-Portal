using { psaa.db as db } from '../db/schema';

service ApprovalSrv {
    entity Timesheets as projection on db.Timesheets;
    entity TimesheetApprovalHistory as projection on db.TimesheetApprovalHistory;

    action approveTimesheet(
        timesheetID: UUID
    ) returns Boolean;

    action rejectTimesheet(
        timesheetID: UUID,
        reason: String(500)
    ) returns Boolean;
}