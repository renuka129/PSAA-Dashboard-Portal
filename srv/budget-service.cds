
using { psaa.db as db } from '../db/schema';

service BudgetSrv {
    entity Budgets as projection on db.Budgets;
}
