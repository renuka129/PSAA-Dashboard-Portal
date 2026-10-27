using { cuid, managed } from '@sap/cds/common';

using {
    psaa.common.Name,
    psaa.common.Description,
    psaa.common.Email,
    psaa.common.PhoneNo,
    psaa.common.CurrencyCode,
    psaa.common.Amount,
    psaa.common.Hours,
    psaa.common.Percentage,
    psaa.common.ClientStatus,
    psaa.common.ProjectStatus,
    psaa.common.BillingType,
    psaa.common.BudgetStatus,
    psaa.common.TaskStatus,
    psaa.common.TimesheetStatus,
    psaa.common.InvoiceStatus,
    psaa.common.Criticality
} from './common';
 
namespace psaa.db;

entity Clients : cuid, managed {
    name       : Name not null;
    email      : Email;
    phone      : PhoneNo;
    status     : ClientStatus default #ACTIVE;
    street     : String(150);
    city       : String(100);
    state      : String(100);
    postalCode : String(20);
    country    : String(100);
    notes      : Description;
    projects   : Association to many Projects on projects.client = $self;
}


entity Employees : cuid, managed {
    employeeNo  : String(30) not null;
    firstName   : String(80) not null;
    lastName    : String(80) not null;
    fullName    : String(170);
    email       : Email not null;
    phone       : PhoneNo;
    designation : String(100);
    department  : String(100);
    status      : String(30) default 'Active';

    // Employee cost rate used for project labor-cost calculations
    hourlyCostRate : Amount default 0;

    manager     : Association to Employees;
}


entity Projects : cuid, managed {
    code         : String(30) not null;
    name         : Name not null;
    description  : Description;

    client       : Association to Clients not null;
    manager      : Association to Employees;

    billingType  : BillingType not null;
    status       : ProjectStatus default #PLANNED;

    startDate    : Date;
    endDate      : Date;

    currency     : CurrencyCode default 'INR';
    budgetAmount : Amount default 0;
    billingRate  : Amount default 0;

    budgets      : Association to many Budgets
                     on budgets.project = $self;
    milestones   : Association to many Milestones
                     on milestones.project = $self;
    tasks        : Association to many Tasks
                     on tasks.project = $self;
    timesheets   : Association to many Timesheets
                     on timesheets.project = $self;
    invoices     : Association to many Invoices
                     on invoices.project = $self;
    alerts       : Association to many Alerts
                     on alerts.project = $self;
}

entity Budgets : cuid, managed {
    project        : Association to Projects not null;
    budgetAmount   : Amount not null;
    consumedAmount : Amount default 0;
    currency       : CurrencyCode default 'INR';
    status         : BudgetStatus default #WITHIN_BUDGET;
}

entity Milestones : cuid, managed {
    project       : Association to Projects not null;
    name          : Name not null;
    description   : Description;
    startDate     : Date;
    dueDate       : Date;
    completionPct : Percentage default 0;
    status        : String(30) default 'Planned';
}

entity Tasks : cuid, managed {
    project        : Association to Projects not null;
    name           : Name not null;
    description    : Description;
    status         : TaskStatus default #OPEN;
    estimatedHours : Hours not null;
    actualHours    : Hours default 0;
    criticality    : Criticality default #LOW;
    dueDate        : Date;

    milestone      : Association to Milestones;
}

entity Timesheets : cuid, managed {
    employee        : Association to Employees not null;
    project         : Association to Projects not null;

    weekStart       : Date not null;
    weekEnd         : Date not null;

    status          : TimesheetStatus default #DRAFT;
    totalHours      : Hours default 0;

    submittedAt     : Timestamp;
    approvedAt      : Timestamp;
    approver        : Association to Employees;
    rejectionReason : String(500);

    entries         : Association to many TimesheetEntries
                        on entries.timesheet = $self;
}

entity TimesheetEntries : cuid, managed {
    timesheet : Association to Timesheets not null;
    task      : Association to Tasks not null;
    workDate  : Date not null;
    hours     : Hours not null;
    billable  : Boolean default true;
    notes     : Description;

    invoice   : Association to Invoices;
}

entity Invoices : cuid, managed {
    invoiceNo   : String(40) not null;

    project     : Association to Projects not null;
    client      : Association to Clients not null;

    status      : InvoiceStatus default #DRAFT;

    issueDate   : Date;
    dueDate     : Date;
    paidDate    : Date;

    subtotal    : Amount default 0;
    taxRate     : Percentage default 18;
    taxAmount   : Amount default 0;
    totalAmount : Amount default 0;

    currency    : CurrencyCode default 'INR';
}

entity Alerts : cuid, managed {
    project     : Association to Projects not null;
    task        : Association to Tasks;

    threshold   : Percentage not null;
    description : Description not null;
    severity    : Criticality default #MEDIUM;

    triggeredAt : Timestamp;
    acknowledged: Boolean default false;
}

entity TimesheetApprovalHistory : cuid, managed {
    timesheet   : Association to Timesheets not null;
    action      : String(20) not null;
    performedBy : Association to Employees not null;
    actionAt    : Timestamp not null;
    comments    : String(500);
}

entity UserAccounts : cuid, managed {
    email          : Email not null;
    passwordHash   : String(255) not null;

    role           : String(20) not null default 'Employee';
    isActive       : Boolean default true;

    employee       : Association to Employees;
}