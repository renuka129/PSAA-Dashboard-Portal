const cds = require('@sap/cds');
const { SELECT } = cds.ql;
const { recalculateProject } = require('./rollup');

module.exports = function () {
    const { Budgets, Projects } = cds.entities('psaa.db');

    function getBudgetID(req, data) {
        return data?.ID
            || req.data?.ID
            || req.params?.[0]?.ID;
    }

    this.before(['CREATE', 'UPDATE'], 'Budgets', async (req) => {
        const { budgetAmount, project_ID, currency } = req.data;

        if (
            budgetAmount !== undefined &&
            (!Number.isFinite(Number(budgetAmount)) || Number(budgetAmount) < 0)
        ) {
            return req.reject(
                400,
                'Budget amount must be a valid non-negative number.'
            );
        }

        if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
            return req.reject(
                400,
                'Currency must be a three-letter uppercase code, such as INR.'
            );
        }

        let effectiveProjectID = project_ID;

        if (req.event === 'UPDATE') {
            const budgetID = getBudgetID(req);

            if (!budgetID) {
                return req.reject(400, 'Budget ID is required for updates.');
            }

            const existing = await cds.tx(req).run(
                SELECT.one.from(Budgets).where({ ID: budgetID })
            );

            if (!existing) {
                return req.reject(404, 'Budget not found.');
            }

            effectiveProjectID = effectiveProjectID || existing.project_ID;
        }

        if (!effectiveProjectID) {
            return req.reject(400, 'A project is required for this budget.');
        }

        const project = await cds.tx(req).run(
            SELECT.one.from(Projects)
                .columns('ID')
                .where({ ID: effectiveProjectID })
        );

        if (!project) {
            return req.reject(400, 'The selected project does not exist.');
        }
    });

    this.after(['CREATE', 'UPDATE'], 'Budgets', async (data, req) => {
        const budgetID = getBudgetID(req, data);

        let projectID = data?.project_ID || req.data?.project_ID;

        if (!projectID && budgetID) {
            const budget = await cds.tx(req).run(
                SELECT.one.from(Budgets)
                    .columns('project_ID')
                    .where({ ID: budgetID })
            );

            projectID = budget?.project_ID;
        }

        if (projectID) {
            await recalculateProject(cds.tx(req), projectID);
        }
    });
};