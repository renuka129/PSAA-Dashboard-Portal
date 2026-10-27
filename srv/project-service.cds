
using { psaa.db as db } from '../db/schema';

service ProjectSrv {
    entity Projects as projection on db.Projects;
}
