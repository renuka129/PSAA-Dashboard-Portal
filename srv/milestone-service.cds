
using { psaa.db as db } from '../db/schema';

service MilestoneSrv {
    entity Milestones as projection on db.Milestones;
}
