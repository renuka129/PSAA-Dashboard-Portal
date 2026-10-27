const cds = require("@sap/cds");
const bcrypt = require("bcryptjs");

const { SELECT } = cds.ql;

module.exports = function () {
    const { UserAccounts } = cds.entities("psaa.db");

    this.on("login", async (req) => {
        const { email, password } = req.data;

        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return req.reject(400, "Email and password are required.");
        }

        const account = await SELECT.one
            .from(UserAccounts)
            .where({ email: email.trim().toLowerCase() });

        if (!account || !account.isActive) {
            return req.reject(401, "Invalid email or password.");
        }

        const validPassword = await bcrypt.compare(
            password,
            account.passwordHash
        );

        if (!validPassword) {
            return req.reject(401, "Invalid email or password.");
        }

        return {
            message: "Login successful",
            role: account.role,
            employeeID: account.employee_ID || null
        };
    });
};