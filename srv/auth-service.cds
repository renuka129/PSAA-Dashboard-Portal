using { psaa.db as db } from '../db/schema';

service AuthService {
    action login(
        email: String(255),
        password: String(255)
    ) returns {
        message: String(100);
        role: String(20);
        employeeID: UUID;
    };
}