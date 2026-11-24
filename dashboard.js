window.addEventListener("pageshow", async () => {
    const res = await fetch("dashboard_api.php?action=data", { cache: "no-store" });
    if (res.status === 401) {
        window.location.replace("Loginpage.html");
    }
});
let invChart = null;
let salesChart = null;
let costChart = null;
let currentUser = null;
let selectedLocationIds = [];
async function loadDashboard() {
    const range = document.getElementById("rangeSelect").value;
    const locParam = selectedLocationIds.join(",");
    const url = `dashboard_api.php?action=data&location_ids=${encodeURIComponent(locParam)}&range=${encodeURIComponent(range)}`;

    const res = await fetch(url);
    if (res.status === 401) {
        window.location.href = "Loginpage.html";
        return;
    }
    const data = await res.json();
    currentUser = data.user;
    selectedLocationIds = (data.location_ids || []).map(Number);

    document.getElementById("userBadge").textContent =
        `Signed in as ${currentUser.username} (${currentUser.role})`;

    renderLocationControls(data.locations || []);
    renderAlerts(data.items);
    renderInventoryTable(data.items);
    populateItemDropdowns(data.items);
    renderPendingTable(data.pending);
    renderCharts(data.items, data.sales, data.costs);
    renderManagerPanel(data.users || [], data.locations || []);
}

function renderLocationControls(locations) {
    const container = document.getElementById("locationControls");
    if (!container) return;

    if (currentUser.role !== "manager") {
        const locName = locations[0]?.name || "Unassigned";
        container.innerHTML = `<span>Location: <strong>${locName}</strong></span>`;
        return;
    }

    const allChecked = locations.length > 0 && selectedLocationIds.length === locations.length;
    container.innerHTML = `
        <span>Locations:</span>
        <label style="cursor:pointer;">
            <input type="checkbox" id="locAll" ${allChecked ? "checked" : ""}> All
        </label>
        ${locations.map(l => `
            <label style="cursor:pointer;">
                <input type="checkbox" class="loc-cb" value="${l.id}" ${selectedLocationIds.includes(Number(l.id)) ? "checked" : ""}>
                ${l.name}
            </label>
        `).join("")}
    `;

    document.getElementById("locAll")?.addEventListener("change", (e) => {
        selectedLocationIds = e.target.checked
            ? locations.map(l => Number(l.id))
            : (locations[0] ? [Number(locations[0].id)] : []);
        loadDashboard();
    });

    container.querySelectorAll(".loc-cb").forEach(cb => {
        cb.addEventListener("change", () => {
            const checked = Array.from(container.querySelectorAll(".loc-cb:checked")).map(c => Number(c.value));
            if (checked.length === 0) {
                cb.checked = true; // Keep at least one location selected
                return;
            }
            selectedLocationIds = checked;
            loadDashboard();
        });
    });
}
function renderAlerts(items) {
    const low = items.filter(i => parseFloat(i.quantity) <= parseFloat(i.low_threshold));
    const banner = document.getElementById("lowStockBanner");
    if (low.length > 0) {
        banner.style.display = "block";
        banner.innerHTML = `<strong>Low Stock Alert:</strong> ` +
            low.map(i => `${i.name} (${i.quantity} ${i.unit}, threshold: ${i.low_threshold})`).join(" | ");
    } else {
        banner.style.display = "none";
    }
}

function renderInventoryTable(items) {
    const isManager = currentUser.role === "manager";
    const tbody = document.getElementById("inventoryBody");
    tbody.innerHTML = items.map(i => {
        const isLow = parseFloat(i.quantity) <= parseFloat(i.low_threshold);
        const thresholdCell = isManager
            ? `<input type="number" step="0.01" min="0" value="${i.low_threshold}" style="width:70px;" onchange="updateThreshold(${i.id}, this.value)">`
            : i.low_threshold;

        return `<tr class="${isLow ? "low-row" : ""}">
            <td>${i.name}</td>
            <td>${i.type}</td>
            <td>${i.quantity} ${i.unit}</td>
            <td>${thresholdCell}</td>
            <td>$${parseFloat(i.cost_per_unit).toFixed(2)}</td>
            <td>${i.price !== null ? "$" + parseFloat(i.price).toFixed(2) : "-"}</td>
        </tr>`;
    }).join("") || `<tr><td colspan="6">No items at this location yet.</td></tr>`;
}

function populateItemDropdowns(items) {
    const stockSel = document.getElementById("stockItem");
    stockSel.innerHTML = items.map(i => `<option value="${i.id}">${i.name} (${i.type})</option>`).join("");

    const products = items.filter(i => i.type === "product");
    const saleSel = document.getElementById("saleItem");
    saleSel.innerHTML = products.map(i => `<option value="${i.id}">${i.name} ($${parseFloat(i.price || 0).toFixed(2)})</option>`).join("");
}

function renderPendingTable(pending) {
    const isManager = currentUser.role === "manager";
    const tbody = document.getElementById("pendingBody");
    tbody.innerHTML = pending.map(c => {
        let details = "";
        if (c.kind === "stock") details = `Delta: ${c.delta > 0 ? "+" : ""}${c.delta}`;
        else if (c.kind === "sale") details = `Qty Sold: ${c.qty}`;
        else if (c.kind === "item") details = `${c.proposed_type}, Qty: ${c.proposed_qty} ${c.proposed_unit}, Cost: $${c.proposed_cost}`;

        const actions = isManager
            ? `<button class="bb-btn-approve" onclick="decideChange(${c.id}, 'approved')">Approve</button>
               <button class="bb-btn-reject" onclick="decideChange(${c.id}, 'rejected')">Reject</button>`
            : `<em>Awaiting Manager</em>`;

        return `<tr>
            <td>${c.kind.toUpperCase()}</td>
            <td>${c.item_name}</td>
            <td>${details}</td>
            <td>${c.requested_by_name}</td>
            <td>${c.note || ""}</td>
            <td>${actions}</td>
        </tr>`;
    }).join("") || `<tr><td colspan="6">No pending requests.</td></tr>`;
}

function renderCharts(items, sales, costs) {
    if (invChart) invChart.destroy();
    if (salesChart) salesChart.destroy();
    if (costChart) costChart.destroy();

    invChart = new Chart(document.getElementById("inventoryChart"), {
        type: "bar",
        data: {
            labels: items.map(i => i.name),
            datasets: [{
                label: "Current Quantity",
                data: items.map(i => parseFloat(i.quantity)),
                backgroundColor: items.map(i =>
                    parseFloat(i.quantity) <= parseFloat(i.low_threshold) ? "#ef4444" : "#3b82f6"
                )
            }]
        }
    });

    salesChart = new Chart(document.getElementById("salesChart"), {
        type: "line",
        data: {
            labels: sales.map(s => s.day),
            datasets: [{
                label: "Revenue ($)",
                data: sales.map(s => parseFloat(s.total)),
                borderColor: "#16a34a",
                tension: 0.25,
                fill: false
            }]
        }
    });

    costChart = new Chart(document.getElementById("costChart"), {
        type: "bar",
        data: {
            labels: costs.map(c => c.day),
            datasets: [{
                label: "Spending ($)",
                data: costs.map(c => parseFloat(c.total)),
                backgroundColor: "#f59e0b"
            }]
        }
    });
}

function renderManagerPanel(users, locations) {
    const panel = document.getElementById("managerPanel");
    if (!panel) return;

    if (currentUser.role !== "manager") {
        panel.style.display = "none";
        return;
    }
    panel.style.display = "block";

    const tbody = document.getElementById("usersBody");
    tbody.innerHTML = users.map(u => {
        const locOptions = `<option value="">Unassigned</option>` + locations.map(l =>
            `<option value="${l.id}" ${l.id == u.location_id ? "selected" : ""}>${l.name}</option>`
        ).join("");

        return `<tr>
            <td>${u.username}</td>
            <td>${u.email}</td>
            <td>
                <select id="role-${u.id}">
                    <option value="employee" ${u.role === "employee" ? "selected" : ""}>Employee</option>
                    <option value="manager" ${u.role === "manager" ? "selected" : ""}>Manager</option>
                </select>
            </td>
            <td>
                <select id="loc-${u.id}">${locOptions}</select>
            </td>
           <td>
             <button class="bb-btn" type="button" onclick="saveUser(${u.id})">Save</button>
             ${u.role === "employee" ? `<button class="bb-btn-reject" type="button" onclick="deleteUser(${u.id}, '${u.username}')">Remove</button>` : ""}
         </td>
        </tr>`;
    }).join("");
}

async function postApi(action, payload) {
    const res = await fetch(`dashboard_api.php?action=${encodeURIComponent(action)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
        alert(data.error || "Request failed");
        return false;
    }
    await loadDashboard();
    return true;
}

async function saveUser(userId) {
    const role = document.getElementById(`role-${userId}`).value;
    const location_id = document.getElementById(`loc-${userId}`).value;
    const ok = await postApi("update_user", { user_id: userId, role, location_id });
    if (ok) alert("User updated!");
}

async function deleteUser(userId, username) {
    if (!confirm(`Remove employee "${username}"? This cannot be undone.`)) return;
    const ok = await postApi("delete_user", { user_id: userId });
    if (ok) alert(`${username} has been removed.`);
}

async function updateThreshold(itemId, low_threshold) {
    await postApi("update_threshold", { item_id: itemId, low_threshold });
}

async function decideChange(changeId, decision) {
    let reason = "";
    if (decision === "rejected") {
        reason = prompt("Reason for rejection (optional):") || "";
    }
    await postApi("decide_change", { change_id: changeId, decision, reason });
}



document.getElementById("rangeSelect").addEventListener("change", () => {
    loadDashboard();
});

document.getElementById("locationForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("newLocationName");
    const ok = await postApi("add_location", { name: nameInput.value });
    if (ok) nameInput.value = "";
});

document.getElementById("stockForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await postApi("request_change", {
        kind: "stock",
        location_id: currentLocationId,
        item_id: document.getElementById("stockItem").value,
        delta: document.getElementById("stockDelta").value,
        note: document.getElementById("stockNote").value
    });
    if (ok) e.target.reset();
});

document.getElementById("saleForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await postApi("request_change", {
        kind: "sale",
        location_id: currentLocationId,
        item_id: document.getElementById("saleItem").value,
        qty: document.getElementById("saleQty").value,
        note: document.getElementById("saleNote").value
    });
    if (ok) e.target.reset();
});

document.getElementById("newItemForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await postApi("request_change", {
        kind: "item",
        location_id: currentLocationId,
        item_name: document.getElementById("newName").value,
        proposed_type: document.getElementById("newType").value,
        proposed_unit: document.getElementById("newUnit").value,
        proposed_qty: document.getElementById("newQty").value,
        proposed_cost: document.getElementById("newCost").value,
        proposed_price: document.getElementById("newPrice").value
    });
    if (ok) e.target.reset();
});

function applyTheme(isLight) {
    document.body.classList.toggle("light-theme", isLight);
    const btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = isLight ? "Dark Mode" : "Light Mode";
    Chart.defaults.color = isLight ? "#2c1a10" : "#f5e6cc";
    Chart.defaults.borderColor = isLight ? "rgba(44, 26, 16, 0.15)" : "rgba(245, 230, 204, 0.15)";
}

document.getElementById("themeToggle")?.addEventListener("click", () => {
    const isLight = !document.body.classList.contains("light-theme");
    localStorage.setItem("bb_theme", isLight ? "light" : "dark");
    applyTheme(isLight);
    loadDashboard();
});

applyTheme(localStorage.getItem("bb_theme") === "light");
loadDashboard();