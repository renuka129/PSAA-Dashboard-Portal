using { psaa.db as db } from '../db/schema';

service InvoiceSrv {
    entity Invoices as projection on db.Invoices;

    action generateInvoice(
        projectID : UUID,
        issueDate : Date
    ) returns UUID;

    action issueInvoice(
        invoiceID : UUID,
        issueDate : Date
    ) returns Boolean;

    action markInvoicePaid(
        invoiceID : UUID,
        paidDate : Date
    ) returns Boolean;
}