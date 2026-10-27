const cds = require('@sap/cds');
const { SELECT, INSERT, UPDATE } = cds.ql;

module.exports = function () {
    const {
        Projects,
        Timesheets,
        TimesheetEntries,
        Invoices
    } = cds.entities('psaa.db');

    function dateString(value) {
        if (!value) return '';
        return String(value).slice(0, 10);
    }

    function isValidDate(value) {
        const date = dateString(value);
        return /^\d{4}-\d{2}-\d{2}$/.test(date)
            && !Number.isNaN(Date.parse(`${date}T00:00:00Z`));
    }

    function addDays(value, days) {
        const date = new Date(`${dateString(value)}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + days);
        return date.toISOString().slice(0, 10);
    }

    this.on('generateInvoice', async (req) => {
        const tx = cds.tx(req);
        const { projectID, issueDate } = req.data;

        if (!projectID) {
            return req.reject(400, 'Project ID is required.');
        }

        if (!isValidDate(issueDate)) {
            return req.reject(400, 'A valid issue date is required (YYYY-MM-DD).');
        }

        const project = await tx.run(
            SELECT.one.from(Projects).where({ ID: projectID })
        );

        if (!project) {
            return req.reject(404, 'Project not found.');
        }

        if (project.billingType !== 'TM') {
            return req.reject(
                400,
                'Automatic invoice generation currently supports Time & Material projects only.'
            );
        }

        const rate = Number(project.billingRate || 0);
        if (rate <= 0) {
            return req.reject(
                400,
                'Set a positive billing rate on the project before generating an invoice.'
            );
        }

        const approvedTimesheets = await tx.run(
            SELECT.from(Timesheets)
                .columns('ID')
                .where({
                    project_ID: projectID,
                    status: 'APPROVED'
                })
        );

        if (!approvedTimesheets.length) {
            return req.reject(
                400,
                'There are no approved timesheets available for invoicing.'
            );
        }

        const timesheetIDs = approvedTimesheets.map(item => item.ID);

        // Only billable entries from approved timesheets that are not
        // already reserved by another invoice can be included.
        const entries = await tx.run(
            SELECT.from(TimesheetEntries)
                .where({
                    timesheet_ID: { in: timesheetIDs },
                    billable: true,
                    invoice_ID: null
                })
        );

        if (!entries.length) {
            return req.reject(
                400,
                'No uninvoiced billable entries were found for this project.'
            );
        }

        const subtotal = Math.round(
            entries.reduce(
                (sum, entry) => sum + Number(entry.hours || 0) * rate,
                0
            ) * 100
        ) / 100;

        const taxRate = 18;
        const taxAmount = Math.round(subtotal * taxRate) / 100;
        const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

        const invoiceID = cds.utils.uuid();
        const invoiceNo =
            `PSAA-${dateString(issueDate).replaceAll('-', '')}-${invoiceID.slice(0, 8).toUpperCase()}`;

        await tx.run(
            INSERT.into(Invoices).entries({
                ID: invoiceID,
                invoiceNo,
                project_ID: projectID,
                client_ID: project.client_ID,
                status: 'DRAFT',
                issueDate: dateString(issueDate),
                dueDate: addDays(issueDate, 30),
                subtotal,
                taxRate,
                taxAmount,
                totalAmount,
                currency: project.currency || 'INR'
            })
        );

        // Reserve these entries for this invoice so another invoice
        // cannot bill them while this invoice is still a draft.
        const entryIDs = entries.map(entry => entry.ID);

        await tx.run(
            UPDATE(TimesheetEntries)
                .set({ invoice_ID: invoiceID })
                .where({ ID: { in: entryIDs } })
        );

        return invoiceID;
    });

    this.on('issueInvoice', async (req) => {
        const tx = cds.tx(req);
        const { invoiceID, issueDate } = req.data;

        if (!invoiceID) {
            return req.reject(400, 'Invoice ID is required.');
        }

        if (!isValidDate(issueDate)) {
            return req.reject(400, 'A valid issue date is required (YYYY-MM-DD).');
        }

        const invoice = await tx.run(
            SELECT.one.from(Invoices).where({ ID: invoiceID })
        );

        if (!invoice) {
            return req.reject(404, 'Invoice not found.');
        }

        if (invoice.status !== 'DRAFT') {
            return req.reject(409, 'Only draft invoices can be issued.');
        }

        const linkedEntries = await tx.run(
            SELECT.from(TimesheetEntries)
                .columns('ID', 'timesheet_ID')
                .where({ invoice_ID: invoiceID })
        );

        if (!linkedEntries.length) {
            return req.reject(400, 'This invoice has no linked timesheet entries.');
        }

        const actualDueDate = addDays(issueDate, 30);

        await tx.run(
            UPDATE(Invoices)
                .set({
                    status: 'ISSUED',
                    issueDate: dateString(issueDate),
                    dueDate: actualDueDate
                })
                .where({ ID: invoiceID })
        );

        // Mark a timesheet INVOICED only when every billable entry on it
        // is linked to an invoice that has been issued or paid.
        const timesheetIDs = [
            ...new Set(linkedEntries.map(entry => entry.timesheet_ID))
        ];

        for (const timesheetID of timesheetIDs) {
            const allEntries = await tx.run(
                SELECT.from(TimesheetEntries)
                    .columns('ID', 'billable', 'invoice_ID')
                    .where({ timesheet_ID: timesheetID })
            );

            const billableEntries = allEntries.filter(entry => entry.billable);

            if (!billableEntries.length) continue;

            let allBilled = true;

            for (const entry of billableEntries) {
                if (!entry.invoice_ID) {
                    allBilled = false;
                    break;
                }

                const linkedInvoice = await tx.run(
                    SELECT.one.from(Invoices)
                        .columns('status')
                        .where({ ID: entry.invoice_ID })
                );

                if (
                    !linkedInvoice ||
                    !['ISSUED', 'PAID'].includes(linkedInvoice.status)
                ) {
                    allBilled = false;
                    break;
                }
            }

            if (allBilled) {
                await tx.run(
                    UPDATE(Timesheets)
                        .set({ status: 'INVOICED' })
                        .where({
                            ID: timesheetID,
                            status: 'APPROVED'
                        })
                );
            }
        }

        return true;
    });

    this.on('markInvoicePaid', async (req) => {
        const tx = cds.tx(req);
        const { invoiceID, paidDate } = req.data;

        if (!invoiceID) {
            return req.reject(400, 'Invoice ID is required.');
        }

        if (!isValidDate(paidDate)) {
            return req.reject(400, 'A valid paid date is required (YYYY-MM-DD).');
        }

        const invoice = await tx.run(
            SELECT.one.from(Invoices).where({ ID: invoiceID })
        );

        if (!invoice) {
            return req.reject(404, 'Invoice not found.');
        }

        if (invoice.status !== 'ISSUED') {
            return req.reject(409, 'Only issued invoices can be marked as paid.');
        }

        if (dateString(paidDate) < dateString(invoice.issueDate)) {
            return req.reject(400, 'The paid date cannot be earlier than the issue date.');
        }

        await tx.run(
            UPDATE(Invoices)
                .set({
                    status: 'PAID',
                    paidDate: dateString(paidDate)
                })
                .where({ ID: invoiceID })
        );

        return true;
    });
};