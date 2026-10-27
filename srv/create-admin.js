const cds = require("@sap/cds");
const bcrypt = require("bcryptjs");
const readline = require("readline");

const { SELECT, INSERT } = cds.ql;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (question) =>
    new Promise((resolve) => rl.question(question, resolve));

async function main() {
    try {
        const email = (await ask("Admin email: "))
            .trim()
            .toLowerCase();

        const password = await ask("Admin password (minimum 12 characters): ");

        if (!email || password.length < 12) {
            throw new Error("Enter a valid email and a password of at least 12 characters.");
        }

        await cds.connect.to("db");

        const UserAccounts = cds.model.definitions["psaa.db.UserAccounts"];

        const existing = await SELECT.one
            .from(UserAccounts)
            .where({ email });

        if (existing) {
            throw new Error("An account with this email already exists.");
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await INSERT.into(UserAccounts).entries({
            email,
            passwordHash,
            role: "Admin",
            isActive: true
        });

        console.log("Admin account created successfully.");
    } finally {
        rl.close();
        await cds.disconnect();
    }
}

main().catch((error) => {
    console.error("Admin setup failed:", error.message);
    process.exitCode = 1;
});