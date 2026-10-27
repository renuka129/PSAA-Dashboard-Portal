
using { psaa.db as db } from '../db/schema';

service EmployeeSrv {
    entity Employees as projection on db.Employees;
}
