
using { psaa.db as db } from '../db/schema';

service TaskSrv {
    entity Tasks as projection on db.Tasks;
}
