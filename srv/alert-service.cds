using { psaa.db as db } from '../db/schema';

service AlertSrv {
    entity Alerts as projection on db.Alerts;

    action acknowledgeAlert(
        alertID : UUID
    ) returns Boolean;
}