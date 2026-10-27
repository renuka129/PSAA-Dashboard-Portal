
using { psaa.db as db } from '../db/schema';

service ClientSrv {
    entity Clients as projection on db.Clients;
}
