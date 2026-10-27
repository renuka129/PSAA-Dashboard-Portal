const cds = require('@sap/cds');
const { SELECT } = cds.ql;
const { recalculateProject } = require('./rollup');

module.exports = function () {
    const { Projects } = cds.entities('psaa.db');

    function getProjectID(req, data) {
        return data?.ID
            || req.data?.ID
            || req.params?.[0]?.ID;
    }

    this.before(['CREATE', 'UPDATE'], 'Projects', async (req) => {
        const { code, name, billingRate, budgetAmount, startDate, endDate } = req.data;

        if (code !== undefined && !String(code).trim()) {
            return req.reject(400, 'Project code cannot be empty.');
        }

        if (name !== undefined && !String(name).trim()) {
            return req.reject(400, 'Project name cannot be empty.');
        }

        if (billingRate !== undefined && Number(billingRate) < 0) {
            return req.reject(400, 'Billing rate cannot be negative.');
        }

        if (budgetAmount !== undefined && Number(budgetAmount) < 0) {
            return req.reject(400, 'Budget amount cannot be negative.');
        }

        if (startDate && endDate && String(startDate) > String(endDate)) {
            return req.reject(400, 'Project end date cannot be before its start date.');
        }

        if (req.event === 'UPDATE') {
            const projectID = getProjectID(req);

            if (!projectID) {
                return req.reject(400, 'Project ID is required for updates.');
            }

            const existing = await cds.tx(req).run(
                SELECT.one.from(Projects).where({ ID: projectID })
            );

            if (!existing) {
                return req.reject(404, 'Project not found.');
            }

            const effectiveStart = startDate ?? existing.startDate;
            const effectiveEnd = endDate ?? existing.endDate;

            if (
                effectiveStart &&
                effectiveEnd &&
                String(effectiveStart) > String(effectiveEnd)
            ) {
                return req.reject(
                    400,
                    'Project end date cannot be before its start date.'
                );
            }
        }
    });

    this.after(['CREATE', 'UPDATE'], 'Projects', async (data, req) => {
        const projectID = getProjectID(req, data);

        if (projectID) {
            await recalculateProject(cds.tx(req), projectID);
        }
    });
};