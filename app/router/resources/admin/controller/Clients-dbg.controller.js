sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Label",
    "sap/m/Input",
    "sap/m/Select",
    "sap/ui/core/Item",
    "sap/m/Button",
    "sap/m/VBox",
    "sap/m/TextArea"
], function (
    Controller,
    JSONModel,
    MessageToast,
    MessageBox,
    Dialog,
    Label,
    Input,
    Select,
    Item,
    Button,
    VBox,
    TextArea
) {
    "use strict";

    var CLIENTS_URL = "/odata/v4/client-srv/Clients";

    return Controller.extend("psaaadmin.controller.Clients", {

        onInit: function () {
            this._oClientsModel = new JSONModel({ clients: [] });
            this.getView().setModel(this._oClientsModel, "clientsModel");
            this._loadClients();
        },

        _loadClients: async function () {
            try {
                var response = await fetch(CLIENTS_URL);
                if (!response.ok) {
                    throw new Error("Unable to load clients");
                }

                var data = await response.json();
                this._aAllClients = data.value || [];
                this._oClientsModel.setProperty("/clients", this._aAllClients);
            } catch (error) {
                MessageBox.error(
                    "Could not load clients. Check the ClientSrv endpoint and CAP server."
                );
                console.error(error);
            }
        },

        onRefresh: function () {
            this._loadClients();
        },

        onSearch: function (oEvent) {
            var query = oEvent.getParameter("newValue") || "";
            query = query.toLowerCase();

            var filtered = (this._aAllClients || []).filter(function (client) {
                return [
                    client.name,
                    client.email,
                    client.city
                ].some(function (value) {
                    return String(value || "").toLowerCase().includes(query);
                });
            });

            this._oClientsModel.setProperty("/clients", filtered);
        },

        onAddClient: function () {
            this._openClientDialog();
        },

        onEditClient: function (oEvent) {
            var client = oEvent.getSource()
                .getBindingContext("clientsModel").getObject();

            this._openClientDialog(client);
        },

        _openClientDialog: function (client) {
            var self = this;
            var editing = Boolean(client);
            var fields = {};

            function makeInput(key, label, value) {
                fields[key] = new Input({
                    value: value || "",
                    width: "100%"
                });

                return new VBox({
                    items: [
                        new Label({ text: label, labelFor: fields[key] }),
                        fields[key]
                    ]
                }).addStyleClass("sapUiSmallMarginBottom");
            }

            function makeStatusSelect(value) {
                fields.status = new Select({
                    width: "100%",
                    selectedKey: value || "ACTIVE",
                    items: [
                        new Item({ key: "ACTIVE", text: "Active" }),
                        new Item({ key: "INACTIVE", text: "Inactive" })
                    ]
                });

                return new VBox({
                    items: [
                        new Label({ text: "Status", labelFor: fields.status }),
                        fields.status
                    ]
                }).addStyleClass("sapUiSmallMarginBottom");
            }

            var content = new VBox({
                width: "100%",
                items: [
                    makeInput("name", "Client Name *", client && client.name),
                    makeInput("email", "Email", client && client.email),
                    makeInput("phone", "Phone", client && client.phone),
                    makeInput("street", "Street", client && client.street),
                    makeInput("city", "City", client && client.city),
                    makeInput("state", "State", client && client.state),
                    makeInput("postalCode", "Postal Code", client && client.postalCode),
                    makeInput("country", "Country", client && client.country),
                    makeStatusSelect(client && client.status),
                    new Label({ text: "Notes" }),
                    fields.notes = new TextArea({
                        value: client && client.notes || "",
                        rows: 3,
                        width: "100%"
                    })
                ]
            });

            var dialog = new Dialog({
                title: editing ? "Edit Client" : "Add Client",
                contentWidth: "32rem",
                content: [content],
                beginButton: new Button({
                    text: "Save",
                    type: "Emphasized",
                    press: async function () {
                        var name = fields.name.getValue().trim();

                        if (!name) {
                            MessageBox.warning("Client Name is required.");
                            return;
                        }

                        var payload = {
                            name: name,
                            email: fields.email.getValue().trim() || null,
                            phone: fields.phone.getValue().trim() || null,
                            street: fields.street.getValue().trim() || null,
                            city: fields.city.getValue().trim() || null,
                            state: fields.state.getValue().trim() || null,
                            postalCode: fields.postalCode.getValue().trim() || null,
                            country: fields.country.getValue().trim() || null,
                            status: fields.status.getSelectedKey(),
                            notes: fields.notes.getValue().trim() || null
                        };

                        try {
                            var response = await fetch(
                                editing
                                    ? CLIENTS_URL + "(" + client.ID + ")"
                                    : CLIENTS_URL,
                                {
                                    method: editing ? "PATCH" : "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "Accept": "application/json"
                                    },
                                    body: JSON.stringify(payload)
                                }
                            );

                            if (!response.ok) {
                                var errorText = await response.text();
                                throw new Error(errorText || "Save failed");
                            }

                            MessageToast.show(
                                editing ? "Client updated successfully" : "Client added successfully"
                            );

                            dialog.close();
                            self._loadClients();
                        } catch (error) {
                            MessageBox.error("Unable to save client: " + error.message);
                        }
                    }
                }),
                endButton: new Button({
                    text: "Cancel",
                    press: function () {
                        dialog.close();
                    }
                }),
                afterClose: function () {
                    dialog.destroy();
                }
            });

            dialog.open();
        },

        onDeleteClient: function (oEvent) {
            var self = this;
            var client = oEvent.getSource()
                .getBindingContext("clientsModel").getObject();

            MessageBox.confirm(
                "Delete client '" + client.name + "'?",
                {
                    title: "Confirm Delete",
                    actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
                    emphasizedAction: MessageBox.Action.DELETE,
                    onClose: async function (action) {
                        if (action !== MessageBox.Action.DELETE) {
                            return;
                        }

                        try {
                            var response = await fetch(
                                CLIENTS_URL + "(" + client.ID + ")",
                                { method: "DELETE" }
                            );

                            if (!response.ok) {
                                throw new Error(await response.text());
                            }

                            MessageToast.show("Client deleted successfully");
                            self._loadClients();
                        } catch (error) {
                            MessageBox.error(
                                "Unable to delete client. It may be linked to existing projects.\n" +
                                error.message
                            );
                        }
                    }
                }
            );
        },

        onNavBack: function () {
            window.history.back();
        }
    });
});