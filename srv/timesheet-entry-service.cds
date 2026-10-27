
using { psaa.db as db } from '../db/schema';

service TimesheetEntrySrv {
    entity TimesheetEntries as projection on db.TimesheetEntries;
}
