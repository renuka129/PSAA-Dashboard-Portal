namespace psaa.common;

type Guid         : UUID;
type Name         : String(100);
type Description  : String(500);
type Email        : String(255);
type PhoneNo      : String(20);
type CurrencyCode : String(3);
type Amount       : Decimal(15,2);
type Hours        : Decimal(8,2);
type Percentage   : Decimal(5,2);

type ClientStatus : String enum {
    ACTIVE   = 'ACTIVE';
    INACTIVE = 'INACTIVE';
}

type ProjectStatus : String enum {
    PLANNED     = 'PLANNED';
    IN_PROGRESS = 'IN_PROGRESS';
    COMPLETED   = 'COMPLETED';
    ON_HOLD     = 'ON_HOLD';
    CANCELLED   = 'CANCELLED';
}

type BillingType : String enum {
    TM       = 'TM';
    FIXED    = 'FIXED';
    RETAINER = 'RETAINER';
}

type BudgetStatus : String enum {
    WITHIN_BUDGET = 'WITHIN_BUDGET';
    AT_RISK       = 'AT_RISK';
    BREACHED      = 'BREACHED';
}

type TaskStatus : String enum {
    OPEN        = 'OPEN';
    IN_PROGRESS = 'IN_PROGRESS';
    DONE        = 'DONE';
    BLOCKED     = 'BLOCKED';
}

type TimesheetStatus : String enum {
    DRAFT     = 'DRAFT';
    SUBMITTED = 'SUBMITTED';
    APPROVED  = 'APPROVED';
    REJECTED  = 'REJECTED';
    INVOICED  = 'INVOICED';
}

type InvoiceStatus : String enum {
    DRAFT  = 'DRAFT';
    ISSUED = 'ISSUED';
    PAID   = 'PAID';
}

type Criticality : String enum {
    LOW      = 'LOW';
    MEDIUM   = 'MEDIUM';
    HIGH     = 'HIGH';
    CRITICAL = 'CRITICAL';
}

aspect Address {
    street     : String(150);
    city       : String(100);
    state      : String(100);
    postalCode : String(20);
    country    : String(100);
}

aspect AmountFields {
    amount   : Amount;
    currency : CurrencyCode default 'INR';
}

aspect DateRange {
    startDate : Date;
    endDate   : Date;
}