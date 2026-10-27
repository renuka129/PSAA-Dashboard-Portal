const cds = require('@sap/cds');
const { SELECT } = cds.ql;
const { recalculateProject } = require('./rollup');

module.exports = function () {
    const { Timesheets } = cds.entities('psaa.db');

    this.after(['CREATE', 'UPDATE', 'DELETE'], 'TimesheetEntries', async (data, req) => {
        const tx = cds.tx(req);

        let timesheetID = data?.timesheet_ID || req.data?.timesheet_ID;

        if (!timesheetID && req.data?.ID) {
            const entry = await tx.run(
                SELECT.one.from('psaa.db.TimesheetEntries')
                    .columns('timesheet_ID')
                    .where({ ID: req.data.ID })
            );

            timesheetID = entry?.timesheet_ID;
        }

        if (!timesheetID) return;

        const timesheet = await tx.run(
            SELECT.one.from(Timesheets)
                .columns('project_ID')
                .where({ ID: timesheetID })
        );

        if (timesheet?.project_ID) {
            await recalculateProject(tx, timesheet.project_ID);
        }
    });
};