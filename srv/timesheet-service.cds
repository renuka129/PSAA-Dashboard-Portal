
using { psaa.db as db } from '../db/schema';

service TimesheetSrv {
    entity Timesheets as projection on db.Timesheets;
    entity TimesheetEntries as projection on db.TimesheetEntries;

    action submitTimesheet(timesheetID: UUID) returns Boolean;
}
