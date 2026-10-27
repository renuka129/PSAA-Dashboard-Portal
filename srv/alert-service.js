const cds = require('@sap/cds');
const { SELECT, UPDATE } = cds.ql;

module.exports = function () {
    const { Alerts } = cds.entities('psaa.db');

    this.on('acknowledgeAlert', async (req) => {
        const tx = cds.tx(req);
        const { alertID } = req.data;

        if (!alertID) {
            return req.reject(400, 'Alert ID is required.');
        }

        const alert = await tx.run(
            SELECT.one.from(Alerts).where({ ID: alertID })
        );

        if (!alert) {
            return req.reject(404, 'Alert not found.');
        }

        if (alert.acknowledged) {
            return true;
        }

        await tx.run(
            UPDATE(Alerts)
                .set({ acknowledged: true })
                .where({ ID: alertID })
        );

        return true;
    });
};