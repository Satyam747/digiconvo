/*
=========================================================
DIGICONVO QR RESTAURANT SYSTEM
COMMON ENGINE
Version 2.0
=========================================================
Shared functions for all pages.
Restaurant-specific data is loaded from Apps Script.
=========================================================
*/

"use strict";

/*=========================================================
GLOBAL STATE
=========================================================*/
let SETTINGS = {};
let LAST_ORDER_COUNT = null;
let SESSION = {
    customer: {
        name: "",
        table: ""
    },
    cart: [],
    order: {
        id: "",
        paymentMode: "",
        subtotal: 0,
        discount: 0,
        gst: 0,
        total: 0,
        status: "Pending",
        createdAt: "",
        notes: ""
    }
};


/*=========================================================
LOCAL STORAGE
=========================================================*/

function saveSession(){

    localStorage.setItem(

        CONFIG.STORAGE.SESSION,

        JSON.stringify(SESSION)

    );

}

function loadSession(){

    try{

        const data=

        localStorage.getItem(

            CONFIG.STORAGE.SESSION

        );

        if(data){

            SESSION=

            JSON.parse(data);

        }

        else{

            saveSession();

        }

    }

    catch(error){

        console.error(error);

        resetSession();

    }

}

function resetSession(){
    SESSION={
        customer:{name:"", table:""},
        cart:[],
        order:{
            id:"", paymentMode:"", subtotal:0, discount:0, gst:0, total:0, status:"Pending", createdAt:"", notes:""
        }
    };
    saveSession();
}


/*=========================================================
SESSION HELPERS
=========================================================*/

function getCustomer(){

    loadSession();

    return SESSION.customer;

}

function setCustomer(

    name,

    table

){

    loadSession();

    SESSION.customer.name=

    name.trim();

    SESSION.customer.table=

    table.toString();

    saveSession();

}

function getCart(){

    loadSession();

    return SESSION.cart;

}

/*=========================================================
SUPABASE API
=========================================================*/
// FIX: Renamed connection variable to "supabaseClient" to prevent crashing
const supabaseClient = supabase.createClient(CONFIG.SUPABASE.URL, CONFIG.SUPABASE.ANON_KEY);

async function api(action, data = {}) {
    try {
        let result;
        
        switch(action) {
            

           case "getSettings": {
                result = await supabaseClient.from('settings').select('*').limit(1);
                const row = (result.data && result.data.length > 0) ? result.data[0] : {};
                return {
                    success: !result.error && result.data && result.data.length > 0,
                    id: row.id || 1,
                    Name: row.restaurant_name || CONFIG.RESTAURANT.NAME,
                    Tagline: row.tagline || CONFIG.RESTAURANT.TAGLINE,
                    Address: row.address || "",
                    Phone: row.phone || "",
                    Logo: row.logo_url || "",
                    GST: row.gst_percent !== undefined ? row.gst_percent : 5,
                    GSTPercent: row.gst_percent !== undefined ? row.gst_percent : 5,
                    Currency: row.currency || CONFIG.UI.CURRENCY || "₹",
                    UPI: row.upi_id || "",
                    WhatsApp: row.whatsapp_number || "",
                    ReviewLink: row.review_link || "",
                    AdminPIN: String(row.admin_pin || "123456"),
                    StaffPIN: String(row.staff_pin || "000000"),
                    AutoRefresh: row.auto_refresh || 10,
                    PrinterWidth: row.printer_width || 58,
                    HappyHourEnabled: row.happy_hour_enabled ? "TRUE" : "FALSE"
                };
            }

            case "saveSettings": {
                const targetId = SETTINGS.id || 1;
                result = await supabaseClient.from('settings').upsert({
                    id: targetId,
                    restaurant_name: data.Name, tagline: data.Tagline, address: data.Address,
                    phone: data.Phone, logo_url: data.Logo, gst_percent: Number(data.GST),
                    currency: data.Currency, upi_id: data.UPI, whatsapp_number: data.WhatsApp,
                    review_link: data.ReviewLink, auto_refresh: Math.max(5, Number(data.AutoRefresh) || 10),
                    printer_width: Number(data.PrinterWidth), happy_hour_enabled: data.HappyHourEnabled === "TRUE",
                    admin_pin: data.AdminPIN, staff_pin: data.StaffPIN
                });
                return { success: !result.error, message: result.error?.message };
            }

            case "getMenu": 
                result = await supabaseClient.from('menu').select('*').order('category', { ascending: true });
                
                // Get current local day and time to calculate live active offers automatically
                const now = new Date();
                const currentDay = now.toLocaleDateString('en-US', { weekday: 'short' }); 
                const currentTimeString = now.toTimeString('en-US', { hour12: false }).substring(0, 5);
                
                const legacyMenu = (result.data || []).map(row => {
                    let finalPrice = Number(row.price);
                    let originalPrice = Number(row.original_price || row.price);
                    let isOfferActive = false;

                    // Dynamic Offer Mathematical Logic
                   // Inside case "getMenu" loop:
if (row.offer_type && row.offer_type !== 'None') {
    // Skip if Happy Hour is globally disabled in restaurant settings
    if (row.offer_type === 'Happy Hour' && String(SETTINGS.HappyHourEnabled).toUpperCase() === 'FALSE') {
        isOfferActive = false;
    } else {
        const days = row.offer_days || [];
        const validDay = days.length === 0 || days.includes(currentDay);
        let validTime = true;
        if (row.start_time && row.end_time) {
            if (row.start_time <= row.end_time) {
                validTime = (currentTimeString >= row.start_time && currentTimeString <= row.end_time);
            } else {
                validTime = (currentTimeString >= row.start_time || currentTimeString <= row.end_time);
            }
        }
        if (validDay && validTime) {
            isOfferActive = true;
            if (row.offer_type === 'Flat') {
                finalPrice = Math.max(0, originalPrice - Number(row.offer_value));
            } else { 
                finalPrice = Math.max(0, originalPrice - (originalPrice * Number(row.offer_value) / 100));
            }
        }
    }
}

                   const parsedCartSafe = (val) => Array.isArray(val) ? val : [];
                    return {
                        id: row.id, category: row.category, name: row.name, description: row.description,
                        originalPrice: originalPrice, price: finalPrice, image: row.image_url,
                        available: row.available, veg: row.veg,
                        isOfferActive: isOfferActive,
                        OfferType: row.offer_type || 'None',
                        ActiveOfferType: isOfferActive ? row.offer_type : 'None',
                        OfferValue: row.offer_value || 0, 
                        StartTime: row.start_time || '', EndTime: row.end_time || '', OfferDays: parsedCartSafe(row.offer_days),
                        ID: row.id, Category: row.category, Name: row.name, Description: row.description,
                        OriginalPrice: originalPrice, Price: finalPrice, Image: row.image_url,
                        Available: row.available, Veg: row.veg
                    };
                });
                return { success: !result.error, data: legacyMenu };

            case "saveMenuItem": 
    if (window.CURRENT_ROLE === "Staff") {
        return { success: false, message: "Access denied. Staff cannot modify menu." };
    }
    result = await supabaseClient.from('menu').upsert({
        id: data.ID || data.id,
        category: data.Category || data.category,
        name: data.Name || data.name,
        description: data.Description || data.description,
        original_price: Number(data.OriginalPrice || data.originalPrice || data.Price || data.price),
        price: Number(data.Price || data.price),
        image_url: data.Image || data.image,
        available: data.Available !== undefined ? data.Available : true,
        veg: data.Veg !== undefined ? data.Veg : true
    });
    return { success: !result.error };

            case "deleteMenuItem":
              if (window.CURRENT_ROLE === "Staff") {
        return { success: false, message: "Access denied. Staff cannot modify menu." };
    }
                result = await supabaseClient.from('menu').delete().eq('id', data.id);
                return { success: !result.error };

            case "toggleAvailability":
               if (window.CURRENT_ROLE === "Staff") {
        return { success: false, message: "Access denied. Staff cannot modify menu." };
    }
                const itemLookup = await supabaseClient.from('menu').select('available').eq('id', data.id).single();
                result = await supabaseClient.from('menu').update({ available: !itemLookup.data.available }).eq('id', data.id);
                return { success: !result.error };

            case "saveOffer":
              if (window.CURRENT_ROLE === "Staff") {
        return { success: false, message: "Access denied. Staff cannot modify menu." };
    }
                result = await supabaseClient.from('menu').update({
                    offer_type: data.offerType, offer_value: data.offerValue,
                    start_time: data.startTime, end_time: data.endTime, offer_days: data.days
                }).eq('id', data.id);
                return { success: !result.error, message: result.error?.message };

            case "removeOffer": 
              if (window.CURRENT_ROLE === "Staff") {
        return { success: false, message: "Access denied. Staff cannot modify menu." };
    }
                result = await supabaseClient.from('menu').update({
                    offer_type: 'None', offer_value: 0, start_time: '', end_time: '', offer_days: []
                }).eq('id', data.id);
                return { success: !result.error, message: result.error?.message };

               case "checkTable": {
                const tableStr = String(data.table || "").trim();
                const allTablesReq = await supabaseClient.from('tables').select('table_number');
                if (!allTablesReq.error && allTablesReq.data && allTablesReq.data.length > 0) {
                    const matchedTable = allTablesReq.data.find(t => String(t.table_number).toLowerCase() === tableStr.toLowerCase());
                    if (!matchedTable) {
                        return { success: false, invalidTable: true, message: `Table "${tableStr}" does not exist. Please check your table number.` };
                    }
                }

                const checkToday = new Date();
                checkToday.setHours(0, 0, 0, 0);
                const activeReq = await supabaseClient
                    .from('orders')
                    .select('id')
                    .eq('table_number', tableStr)
                    .in('status', ['Pending', 'Preparing', 'Ready', 'Served'])
                    .gte('created_at', checkToday.toISOString())
                    .limit(1);

                const isOccupied = Boolean(activeReq.data && activeReq.data.length > 0);
                return { success: true, occupied: isOccupied };
            }

            case "placeOrder": {
                if (!data.cart || data.cart.length === 0) {
                    return { success: false, message: "Cannot process an empty order." };
                }

                const tableStr = String(data.customer.table).trim();
                const liveMenuReq = await api("getMenu");
                if (!liveMenuReq.success || !liveMenuReq.data) {
                    return { success: false, message: "Unable to verify menu catalog." };
                }

                const liveMenu = liveMenuReq.data;
                let verifiedSubtotal = 0;
                let verifiedDiscount = 0;

                for (const cartItem of data.cart) {
                    const realItem = liveMenu.find(m => String(m.id) === String(cartItem.id));
                    if (!realItem || realItem.available === false || realItem.available === "No") {
                        return { success: false, message: `Item "${cartItem.name}" is no longer available.` };
                    }
                    const qty = Math.max(1, Number(cartItem.qty) || 1);
                    const realPrice = Number(realItem.price);
                    const originalPrice = Number(realItem.originalPrice || realItem.price);

                    verifiedSubtotal += Math.max(originalPrice, realPrice) * qty;
                    verifiedDiscount += Math.max(0, (originalPrice - realPrice) * qty);
                    cartItem.qty = qty;
                    cartItem.price = realPrice;
                    cartItem.originalPrice = originalPrice;
                }

                const netSubtotal = Math.max(0, verifiedSubtotal - verifiedDiscount);
                const gstRate = Number(SETTINGS.GST !== undefined ? SETTINGS.GST : (SETTINGS.GSTPercent || 0));
                const verifiedGst = (netSubtotal * gstRate) / 100;
                const verifiedTotal = netSubtotal + verifiedGst;

                // Always create a new KOT row containing ONLY the newly ordered items
                const orderId = generateOrderID();
                const uniqueStr = Math.random().toString(36).substring(2, 6).toUpperCase();
                const invNo = "INV-" + Date.now() + "-" + uniqueStr;
                const kotNo = "KOT-" + Date.now() + "-" + uniqueStr;

                const orderResult = await supabaseClient.from('orders').insert({
                    id: orderId,
                    customer_name: data.customer.name,
                    table_number: tableStr,
                    cart: data.cart,
                    subtotal: verifiedSubtotal,
                    discount: verifiedDiscount,
                    gst: verifiedGst,
                    total: verifiedTotal,
                    payment_mode: data.order.paymentMode || 'Pay at Counter',
                    status: 'Pending',
                    invoice_no: invNo,
                    kot_no: kotNo,
                    notes: data.order.notes || ''
                });

                if (orderResult.error) return { success: false, message: orderResult.error.message };

                await supabaseClient.from('tables').update({ 
                    status: 'Occupied', 
                    current_order_id: orderId 
                }).eq('table_number', tableStr);

                return { 
                    success: true, 
                    orderId, 
                    invoiceNo: invNo, 
                    kotNo, 
                    verifiedSubtotal, 
                    verifiedDiscount, 
                    verifiedGst, 
                    verifiedTotal 
                };
            }

case "getOrders": 
    const ordToday = new Date();
    ordToday.setHours(0,0,0,0);
    result = await supabaseClient.from('orders').select('*').gte('created_at', ordToday.toISOString()).order('created_at', { ascending: false });
    const legacyOrders = (result.data || []).map(row => ({
        id: row.id, 
        dateTime: row.created_at, 
        customer: row.customer_name, 
        table: row.table_number, 
        cart: Array.isArray(row.cart) ? row.cart : JSON.parse(row.cart || '[]'),
        subtotal: row.subtotal, 
        discount: row.discount, 
        gst: row.gst, 
        total: row.total,
        payment: row.payment_mode, 
        status: row.status, 
        invoiceNo: row.invoice_no,
        kotNo: row.kot_no, 
        notes: row.notes
    }));
    return { success: !result.error, data: legacyOrders };

          case "getOrderStatus": {
                result = await supabaseClient.from('orders').select('*').eq('id', data.orderId).single();
                let myOrders = [];
                if (Array.isArray(data.orderIds) && data.orderIds.length > 0) {
                    const multiReq = await supabaseClient
                        .from('orders')
                        .select('id, status, total, cart, table_number, payment_mode, invoice_no, kot_no')
                        .in('id', data.orderIds)
                        .in('status', ['Pending', 'Preparing', 'Ready', 'Served'])
                        .order('created_at', { ascending: true });
                    myOrders = (multiReq.data || []).map(o => ({
                        id: o.id,
                        status: o.status,
                        total: Number(o.total || 0),
                        payment_mode: o.payment_mode,
                        invoice_no: o.invoice_no,
                        kot_no: o.kot_no,
                        cart: Array.isArray(o.cart) ? o.cart : JSON.parse(o.cart || '[]')
                    }));
                }
                const activePrimary = (result.data && ['Completed', 'Cancelled'].includes(result.data.status) && myOrders.length > 0)
                    ? myOrders[myOrders.length - 1]
                    : result.data;
                return {
                    success: !result.error && Boolean(activePrimary),
                    status: activePrimary?.status,
                    orderId: activePrimary?.id,
                    payment: activePrimary?.payment_mode || result.data?.payment_mode,
                    total: activePrimary?.total,
                    invoiceNo: activePrimary?.invoice_no || result.data?.invoice_no,
                    kotNo: activePrimary?.kot_no || result.data?.kot_no,
                    myOrders
                };
            }


            case "updateOrderStatus": 
    // 1. Fetch the order to get the table number and invoice_no
    const orderFetch = await supabaseClient
        .from('orders')
        .select('table_number, invoice_no')
        .eq('id', data.orderId)
        .single();

    if (orderFetch.error) {
        return { 
            success: false, 
            message: "Failed to fetch order: " + orderFetch.error.message 
        };
    }

    const tableNumber = String(orderFetch.data.table_number);

    // 2. Update the order status (when marking Completed, settle all active orders for this table under one shared invoice_no)
    let orderUpdate;
    if (data.status === 'Completed') {
        const activeTbl = await supabaseClient
            .from('orders')
            .select('id, invoice_no')
            .eq('table_number', tableNumber)
            .in('status', ['Pending', 'Preparing', 'Ready', 'Served'])
            .order('created_at', { ascending: true });
        const sharedInvoiceNo = (activeTbl.data && activeTbl.data.length > 0)
            ? activeTbl.data[0].invoice_no
            : orderFetch.data.invoice_no;

        orderUpdate = await supabaseClient
            .from('orders')
            .update({ status: 'Completed', invoice_no: sharedInvoiceNo })
            .eq('table_number', tableNumber)
            .in('status', ['Pending', 'Preparing', 'Ready', 'Served']);
        await supabaseClient
            .from('orders')
            .update({ status: 'Completed', invoice_no: sharedInvoiceNo })
            .eq('id', data.orderId);
    } else {
        orderUpdate = await supabaseClient
            .from('orders')
            .update({ status: data.status })
            .eq('id', data.orderId);
    }

    if (orderUpdate.error) {
        return { 
            success: false, 
            message: "Failed to update order: " + orderUpdate.error.message 
        };
    }

    // 3. Update the table status
    // 3. Update the table status safely
    let tableUpdate;
    if (['Cancelled', 'Completed'].includes(data.status)) {
        const activeOrders = await supabaseClient
            .from('orders')
            .select('id')
            .eq('table_number', tableNumber)
            .in('status', ['Pending', 'Preparing', 'Ready', 'Served'])
            .neq('id', data.orderId);

        if (!activeOrders.data || activeOrders.data.length === 0) {
            tableUpdate = await supabaseClient
                .from('tables')
                .update({ status: 'Free', current_order_id: null })
                .eq('table_number', tableNumber);
        } else {
            tableUpdate = await supabaseClient
                .from('tables')
                .update({ current_order_id: activeOrders.data[0].id })
                .eq('table_number', tableNumber);
        }
    } else {
        tableUpdate = await supabaseClient
            .from('tables')
            .update({ 
                status: 'Occupied', 
                current_order_id: data.orderId 
            })
            .eq('table_number', tableNumber);
    }

    // CHECK if table update succeeded
    if (tableUpdate.error) {
        console.error("Table update failed:", tableUpdate.error);
        return { 
            success: false, 
            message: "Table status update failed: " + tableUpdate.error.message 
        };
    }

    // Success
    return { success: true };
    
            case "getTables": 
                result = await supabaseClient.from('tables').select('*').order('table_number', { ascending: true });
                const legacyTables = (result.data || []).map(row => ({
                    table: row.table_number, status: row.status, currentOrder: row.current_order_id, qrCode: row.qr_code_url
                }));
                return { success: !result.error, data: legacyTables };

           case "releaseTable": {
                const tblStr = String(data.table);
                const servedTbl = await supabaseClient
                    .from('orders')
                    .select('id, invoice_no')
                    .eq('table_number', tblStr)
                    .in('status', ['Served', 'Ready'])
                    .order('created_at', { ascending: true });
                const sharedInv = (servedTbl.data && servedTbl.data.length > 0)
                    ? servedTbl.data[0].invoice_no
                    : undefined;
                const completeData = sharedInv ? { status: 'Completed', invoice_no: sharedInv } : { status: 'Completed' };

                // Mark Served/Ready orders as Completed under one invoice_no, and un-cooked Pending/Preparing orders as Cancelled
                await supabaseClient.from('orders').update(completeData).eq('table_number', tblStr).in('status', ['Served', 'Ready']);
                await supabaseClient.from('orders').update({ status: 'Cancelled' }).eq('table_number', tblStr).in('status', ['Pending', 'Preparing']);

                result = await supabaseClient
                    .from('tables')
                    .update({ status: 'Free', current_order_id: null })
                    .eq('table_number', tblStr);
                return { success: !result.error };
            }
            case "getDashboard": {
                const dashToday = new Date();
                dashToday.setHours(0,0,0,0);
                const rawOrders = await supabaseClient.from('orders').select('*').gte('created_at', dashToday.toISOString()).order('created_at', { ascending: false });

                let revenue = 0;
                const occupiedTables = new Set();
                const ordersList = (rawOrders.data || []).filter(o => o.status !== 'Cancelled');

                ordersList.forEach(o => {
                    revenue += Number(o.total || 0);
                    if (['Pending', 'Preparing', 'Ready', 'Served'].includes(o.status)) {
                        occupiedTables.add(String(o.table_number));
                    }
                });

                const formattedDashOrders = ordersList.map(row => ({
                    id: row.id,
                    customer: row.customer_name,
                    table: row.table_number,
                    total: row.total,
                    status: row.status,
                    cart: Array.isArray(row.cart) ? row.cart : JSON.parse(row.cart || '[]')
                }));
                return { 
                    success: !rawOrders.error, 
                    data: { 
                        totalOrders: ordersList.length, 
                        activeTables: occupiedTables.size, 
                        revenue: revenue, 
                        orders: formattedDashOrders 
                    } 
                };
            }
                    case "getReports": {
                const repToday = new Date();
                repToday.setHours(0,0,0,0);
                const reportsOrders = await supabaseClient.from('orders').select('*').gte('created_at', repToday.toISOString());

                let totalRevenue = 0, cashRev = 0, upiRev = 0, collectedRevenue = 0, pendingRevenue = 0;
                let nonCancelledCount = 0;
                const salesMap = {};
                const ordersList = reportsOrders.data || [];

                ordersList.forEach(o => {
                    if (o.status === 'Cancelled') return;
                    nonCancelledCount++;
                    const amt = Number(o.total) || 0;
                    totalRevenue += amt;

                    if (o.status === 'Completed') {
                        collectedRevenue += amt;
                    } else {
                        pendingRevenue += amt;
                    }

                    const mode = (o.payment_mode || '').trim().toUpperCase();
                    if (mode === 'UPI') {
                        upiRev += amt;
                    } else {
                        cashRev += amt;
                    }

                    const cartItems = Array.isArray(o.cart) ? o.cart : JSON.parse(o.cart || '[]');
                    cartItems.forEach(i => { 
                        salesMap[i.name] = (salesMap[i.name] || 0) + Number(i.qty || 1); 
                    });
                });
                const topItems = Object.keys(salesMap).map(n => ({ name: n, quantity: salesMap[n] })).sort((a, b) => b.quantity - a.quantity);
                return { 
                    success: !reportsOrders.error, 
                    data: { 
                        totalOrders: nonCancelledCount, 
                        totalRevenue: totalRevenue, 
                        averageBill: nonCancelledCount ? (totalRevenue / nonCancelledCount) : 0, 
                        cashRevenue: cashRev, 
                        upiRevenue: upiRev,
                        collectedRevenue: collectedRevenue,
                        pendingRevenue: pendingRevenue,
                        popularItems: topItems 
                    } 
                };
            }

            case "getActivity": {
                result = await supabaseClient.from('activity_log').select('*').order('created_at', { ascending: false }).limit(50);
                if (result.error && result.error.message.includes("created_at")) {
                    result = await supabaseClient.from('activity_log').select('*').order('time', { ascending: false }).limit(50);
                }
                const legacyActivity = (result.data || []).map(row => ({
                    time: row.created_at || row.time, 
                    user: row.user_role || 'System', 
                    action: row.action,
                    details: row.details,
                    icon: "fa-solid fa-circle-info"
                }));
                return { success: !result.error, data: legacyActivity, message: result.error?.message };
            }

            case "addActivity": 
                result = await supabaseClient.from('activity_log').insert({ action: data.title, details: data.description });
                return { success: !result.error };

                     case "getBill": {
                const billOrderReq = await supabaseClient.from('orders').select('*').eq('id', data.id).single();
                const billSettingsReq = await supabaseClient.from('settings').select('*').limit(1);
                if (billOrderReq.error || !billOrderReq.data) return { success: false, message: "Order not found." };
                const targetOrder = billOrderReq.data;
                const bSet = (billSettingsReq.data && billSettingsReq.data[0]) || {};
                const cur = bSet.currency || SETTINGS.Currency || "₹";

                // Consolidate all active unpaid orders for this table, OR all Completed orders sharing the same settled invoice_no
                let ordersToBill = [targetOrder];
                if (['Pending', 'Preparing', 'Ready', 'Served'].includes(targetOrder.status)) {
                    const activeTblOrders = await supabaseClient
                        .from('orders')
                        .select('*')
                        .eq('table_number', String(targetOrder.table_number))
                        .in('status', ['Pending', 'Preparing', 'Ready', 'Served'])
                        .order('created_at', { ascending: true });
                    if (!activeTblOrders.error && activeTblOrders.data && activeTblOrders.data.length > 0) {
                        ordersToBill = activeTblOrders.data;
                    }
                } else if (targetOrder.status === 'Completed' && targetOrder.invoice_no) {
                    const paidBatchOrders = await supabaseClient
                        .from('orders')
                        .select('*')
                        .eq('table_number', String(targetOrder.table_number))
                        .eq('status', 'Completed')
                        .eq('invoice_no', targetOrder.invoice_no)
                        .order('created_at', { ascending: true });
                    if (!paidBatchOrders.error && paidBatchOrders.data && paidBatchOrders.data.length > 0) {
                        ordersToBill = paidBatchOrders.data;
                    }
                }

                const combinedItemsMap = new Map();
                let totalSub = 0, totalDisc = 0, totalGst = 0, totalGrand = 0;
                const orderIds = [];
                const kotNos = [];

                ordersToBill.forEach(ord => {
                    orderIds.push(ord.id);
                    if (ord.kot_no) kotNos.push(ord.kot_no);
                    totalSub += Number(ord.subtotal || 0);
                    totalDisc += Number(ord.discount || 0);
                    totalGst += Number(ord.gst || 0);
                    totalGrand += Number(ord.total || 0);

                    const cArr = Array.isArray(ord.cart) ? ord.cart : JSON.parse(ord.cart || '[]');
                    cArr.forEach(item => {
                        const key = `${item.name}__${Number(item.price || 0).toFixed(2)}`;
                        if (combinedItemsMap.has(key)) {
                            combinedItemsMap.get(key).qty += Number(item.qty || 1);
                        } else {
                            combinedItemsMap.set(key, {
                                name: item.name,
                                qty: Number(item.qty || 1),
                                price: Number(item.price || 0)
                            });
                        }
                    });
                });

                let billRows = "";
                combinedItemsMap.forEach(item => {
                    const rate = item.price.toFixed(2);
                    const lineTotal = (item.price * item.qty).toFixed(2);
                    billRows += `<tr><td>${escapeHTML(item.name)}</td><td style="text-align:center">${escapeHTML(item.qty)}</td><td style="text-align:right">${escapeHTML(cur)}${rate}</td><td style="text-align:right">${escapeHTML(cur)}${lineTotal}</td></tr>`;
                });

               const firstOrd = ordersToBill[0] || targetOrder;
                const billHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice - Table ${escapeHTML(targetOrder.table_number)}</title><style>body{font-family:monospace;padding:20px;font-size:14px;max-width:320px;margin:auto;}table{width:100%;border-collapse:collapse;}th,td{padding:6px;border-bottom:1px dashed #999;}.center{text-align:center;}.right{text-align:right;}h2{margin:0;}hr{border:none;border-top:1px dashed black;margin:10px 0;}@media print{body{padding:0;}}</style></head><body><div class="center"><h2>${escapeHTML(bSet.restaurant_name) || "Restaurant"}</h2><div>${escapeHTML(bSet.address) || ""}</div><div>${escapeHTML(bSet.phone) || ""}</div></div><hr><div><b>Invoice :</b> ${escapeHTML(firstOrd.invoice_no)}<br><b>Orders  :</b> ${escapeHTML(orderIds.join(', '))}<br><b>KOTs    :</b> ${escapeHTML(kotNos.join(', '))}<br><b>Date    :</b> ${new Date(firstOrd.created_at).toLocaleString('en-IN')}<br><b>Customer:</b> ${escapeHTML(firstOrd.customer_name)}<br><b>Table   :</b> ${escapeHTML(targetOrder.table_number)}<br><b>Payment :</b> ${escapeHTML(targetOrder.payment_mode)}<br></div><hr><table><thead><tr><th align="left">Item</th><th>Qty</th><th class="right">Rate</th><th class="right">Total</th></tr></thead><tbody>${billRows}</tbody></table><hr><table><tr><td>Subtotal</td><td class="right">${escapeHTML(cur)}${totalSub.toFixed(2)}</td></tr><tr><td>Discount</td><td class="right">-${escapeHTML(cur)}${totalDisc.toFixed(2)}</td></tr><tr><td>GST</td><td class="right">${escapeHTML(cur)}${totalGst.toFixed(2)}</td></tr><tr><td><b>Grand Total</b></td><td class="right"><b>${escapeHTML(cur)}${totalGrand.toFixed(2)}</b></td></tr></table><hr><div class="center">Thank You<br>Visit Again</div></body></html>`;
                return { success: true, html: billHtml };
            }

            case "getKOT": {
                const kotOrderReq = await supabaseClient.from('orders').select('*').eq('id', data.id).single();
                const kotSettingsReq = await supabaseClient.from('settings').select('*').limit(1);
                if (kotOrderReq.error || !kotOrderReq.data) return { success: false, message: "Order not found." };
                const kotOrder = kotOrderReq.data;
                const kSet = (kotSettingsReq.data && kotSettingsReq.data[0]) || {};
                const cartArr = Array.isArray(kotOrder.cart) ? kotOrder.cart : JSON.parse(kotOrder.cart || '[]');
                let kotRows = "";
                cartArr.forEach(item => {
                    kotRows += `<tr><td align="left">${escapeHTML(item.name)}</td><td align="right"><b>${escapeHTML(item.qty)}</b></td></tr>`;
                });
                let notesHtml = "";
                if (kotOrder.notes && kotOrder.notes.trim() !== "") {
                    notesHtml = `<hr><div style="border: 1px solid black; padding: 8px; margin-top: 10px;"><b>NOTES:</b><br>${escapeHTML(kotOrder.notes).replace(/\n/g, '<br>')}</div>`;
                }
                const kotHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>KOT - ${escapeHTML(kotOrder.id)}</title><style>body { font-family: monospace; padding: 20px; font-size: 16px; margin: auto; max-width: 320px; } .center { text-align: center; } table { width: 100%; border-collapse: collapse; margin-top: 15px; } td { padding: 8px; border-bottom: 1px dashed #888; } hr { border: none; border-top: 1px dashed black; margin: 12px 0; } @media print { body { padding: 0; } }</style></head><body><div class="center"><h2>${escapeHTML(kSet.restaurant_name) || "Restaurant"}</h2><h3>KITCHEN ORDER TICKET</h3></div><hr><div><b>KOT :</b> ${escapeHTML(kotOrder.kot_no)}<br><b>Order :</b> ${escapeHTML(kotOrder.id)}<br><b>Table :</b> ${escapeHTML(kotOrder.table_number)}<br><b>Customer :</b> ${escapeHTML(kotOrder.customer_name)}<br><b>Time :</b> ${new Date(kotOrder.created_at).toLocaleString('en-IN')}</div><hr><table><thead><tr><th align="left">Item</th><th align="right">Qty</th></tr></thead><tbody>${kotRows}</tbody></table>${notesHtml}<hr><div class="center"><b>PREPARE IMMEDIATELY</b></div></body></html>`;
                return { success: true, html: kotHtml };
            }
                            case "updateTableStatus": 
                result = await supabaseClient.from('tables').update({ status: data.status }).eq('table_number', data.table);
                return { success: !result.error };


            case "closeDay": 
                result = await supabaseClient.rpc('execute_close_day_reset');
                return { success: !result.error, message: result.error?.message || result.data?.message };

            default:
                return { success: false, message: "Unknown Action Parameters" };
        }
    } catch(err) {
        return { success: false, message: err.toString() };
    }
}

/*=========================================================
LOAD SETTINGS
=========================================================*/
async function loadRestaurantSettings(){
    if (SETTINGS && Object.keys(SETTINGS).length > 0 && SETTINGS.Name) {
        return SETTINGS;
    }

    SETTINGS = {
        Name: (typeof CONFIG !== 'undefined' && CONFIG.RESTAURANT?.NAME) || "Restaurant",
        Tagline: (typeof CONFIG !== 'undefined' && CONFIG.RESTAURANT?.TAGLINE) || "Fresh Food & Dining",
        GST: 5,
        GSTPercent: 5,
        Currency: (typeof CONFIG !== 'undefined' && CONFIG.UI?.CURRENCY) || "₹",
        AdminPIN: "123456",
        StaffPIN: "000000",
        AutoRefresh: 10,
        PrinterWidth: 58,
        HappyHourEnabled: "TRUE"
    };

    try {
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 3000)
        );
        const response = await Promise.race([api("getSettings"), timeoutPromise]);
        if (response && response.success) {
            SETTINGS = { ...SETTINGS, ...response };
            delete SETTINGS.success;
        }
    } catch (err) {
        console.warn("Settings sync fallback used:", err.message);
    }

    return SETTINGS;
}

/*=========================================================
STARTUP
=========================================================*/

console.log(

"Common Engine Loaded"

);
/*=========================================================
UTILITY FUNCTIONS
=========================================================*/
function randomID(prefix){
    return prefix + Date.now() + Math.floor(Math.random() * 1000);
}

function generateOrderID(){

    return "ORD" + Date.now() + Math.random().toString(36).substring(2, 6).toUpperCase();
}


function currentDateTime(){
    // Save as a standard ISO string so the parser doesn't crash on printing
    return new Date().toISOString();
}


function formatDate(date){

    if(!date){

        return "-";

    }

    return new Date(

        date

    ).toLocaleString(

        "en-IN"

    );

}

function formatMoney(value){

    value=

    Number(value)||0;

    const currency=

    SETTINGS.Currency||

    CONFIG.UI.CURRENCY||

    "₹";

    return currency+

    value.toFixed(2);

}

function formatNumber(value){

    value=

    Number(value)||0;

    return value.toFixed(2);

}

/*=========================================================
VALIDATION
=========================================================*/

function isBlank(value){

    return(

        value===null||

        value===undefined||

        value.toString()

        .trim()===""

    );

}

function toNumber(value){

    const num=

    Number(value);

    return isNaN(num)?

    0:num;

}

/*=========================================================
TEXT HELPERS
=========================================================*/

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}
function capitalize(text){


    if(!text){

        return "";

    }

    return text

    .charAt(0)

    .toUpperCase()

    +

    text.slice(1);

}

function truncate(

text,

length=30

){

    if(!text){

        return "";

    }

    if(

        text.length<=length

    ){

        return text;

    }

    return text.substring(

        0,

        length

    )+"...";

}

/*=========================================================
IMAGE
=========================================================*/

function imageOrDefault(image){

    if(

        isBlank(image)

    ){

        return CONFIG.UI.DEFAULT_IMAGE;

    }

    return image;

}

/*=========================================================
SEARCH
=========================================================*/

function contains(

text,

keyword

){

    return(

        text||""

    )

    .toString()

    .toLowerCase()

    .includes(

        (

            keyword||""

        )

        .toLowerCase()

    );

}

/*=========================================================
SESSION GUARDS
====================================================*/
function requireSession(){
    loadSession();
    if(isBlank(SESSION.customer.name) || isBlank(SESSION.customer.table)){
        goTo(CONFIG.ROUTES.INDEX);
    }
}

function requireCart(){
    loadSession();
    if(!SESSION.cart || SESSION.cart.length === 0){
        goTo(CONFIG.ROUTES.MENU);
    }
}
/*=========================================================
CART ENGINE
=========================================================*/

function saveCart(){

    saveSession();

}

function clearCart(){

    loadSession();

    SESSION.cart=[];

    saveCart();

}

function getCartItem(id){
    loadSession();
    return SESSION.cart.find(
        item => String(item.id) === String(id)
    );
}

function getCartQuantity(id){

    const item=

    getCartItem(id);

    return item?

    item.qty:0;

}

/*=========================================================
ADD ITEM
=========================================================*/

function addToCart(item){

    loadSession();

    const existing=

    getCartItem(item.id);

    if(existing){

        existing.qty++;

    }

    else{

        SESSION.cart.push({

            id:item.id,

            name:item.name,

            category:

            item.category||"",

            description:

            item.description||"",

            image:

            imageOrDefault(

                item.image

            ),

            price:

            toNumber(

                item.price

            ),

            originalPrice:

            toNumber(

                item.originalPrice||

                item.price

            ),

            qty:1

        });

    }

    saveCart();

}

/*=========================================================
INCREASE
=========================================================*/

function increaseQty(id){

    loadSession();

    const item=

    getCartItem(id);

    if(item){

        item.qty++;

        saveCart();

    }

}

/*=========================================================
DECREASE
=========================================================*/

function decreaseQty(id){

    loadSession();

    const item=

    getCartItem(id);

    if(!item){

        return;

    }

    item.qty--;

    if(item.qty<=0){

        removeFromCart(id);

    }

    else{

        saveCart();

    }

}

/*=========================================================
REMOVE
=========================================================*/

function removeFromCart(id){
    loadSession();
    SESSION.cart = SESSION.cart.filter(
        item => String(item.id) !== String(id)
    );
    saveCart();
}

/*=========================================================
ITEM COUNT
=========================================================*/

function cartItemCount(){

    loadSession();

    let total=0;

    SESSION.cart.forEach(item=>{

        total+=item.qty;

    });

    return total;

}

/*=========================================================
CART TOTAL
=========================================================*/

function cartSubtotal(){

    loadSession();

    let total=0;

    SESSION.cart.forEach(item=>{

        total+=

        item.price*

        item.qty;

    });

    return total;

}
/*=========================================================
BILL ENGINE
=========================================================*/
function calculateBill(){
    loadSession();
    let grossSubtotal = 0;
    let netSubtotal = 0;

    SESSION.cart.forEach(item => {
        const price = toNumber(item.price);
        const original = toNumber(item.originalPrice || item.price);
        const qty = toNumber(item.qty);

        grossSubtotal += Math.max(original, price) * qty;
        netSubtotal += price * qty;
    });

    const totalDiscount = Math.max(0, grossSubtotal - netSubtotal);
    const gstRate = toNumber(SETTINGS.GST !== undefined ? SETTINGS.GST : (SETTINGS.GSTPercent || 0));
    const gst = (netSubtotal * gstRate) / 100;
    const total = netSubtotal + gst;

    SESSION.order.subtotal = grossSubtotal;
    SESSION.order.discount = totalDiscount;
    SESSION.order.gst = gst;
    SESSION.order.total = total;
    SESSION.order.createdAt = currentDateTime();

    if (isBlank(SESSION.order.id)) {
        SESSION.order.id = generateOrderID();
    }

    saveSession();

    return {
        subtotal: grossSubtotal,
        discount: totalDiscount,
        gst: gst,
        total: total
    };
}

/*=========================================================
TOTAL HELPERS
=========================================================*/

function getSubtotal(){

    return calculateBill()

    .subtotal;

}

function getDiscount(){

    return calculateBill()

    .discount;

}

function getGST(){

    return calculateBill()

    .gst;

}

function getGrandTotal(){

    return calculateBill()

    .total;

}

/*=========================================================
ORDER SUMMARY
=========================================================*/

function getOrderSummary(){

    calculateBill();

    return{

        customer:

        SESSION.customer,

        cart:

        SESSION.cart,

        order:

        SESSION.order

    };

}

/*=========================================================
PAYMENT MODE
=========================================================*/

function setPaymentMode(mode){

    loadSession();

    SESSION.order.paymentMode=

    mode;

    saveSession();

}

function getPaymentMode(){

    loadSession();

    return SESSION.order

    .paymentMode||

    "";

}

/*=========================================================
NEW ORDER
=========================================================*/

function newOrderSession(){
    clearCart();
    delete SESSION.lastPlacedOrder;
    SESSION.myOrderIds = [];
    SESSION.order={
        id:"",
        paymentMode:"",
        subtotal:0,
        discount:0,
        gst:0,
        total:0,
        status:"Pending",
        createdAt:"",
        notes:""
    };
    saveSession();
}

/*=========================================================
PRINT ENGINE
=========================================================*/

function centerText(text,width){

    text=text||"";

    if(text.length>=width){

        return text;

    }

    const left=

    Math.floor(

        (width-text.length)/2

    );

    return " ".repeat(left)+text;

}

function billLine(left,right,width){

    left=left||"";

    right=right||"";

    let spaces=

    width-left.length-right.length;

    if(spaces<1){

        spaces=1;

    }

    return left+

    " ".repeat(spaces)+

    right;

}

function line(width){

    return "-".repeat(width);

}

/*=========================================================
KOT
=========================================================*/
function generateKOT(){
    calculateBill();
    const width=CONFIG.UI.THERMAL_WIDTH;
    let kot="";

    kot+=centerText(SETTINGS.Name||CONFIG.RESTAURANT.NAME,width)+"\n";
    kot+=line(width)+"\n";
    kot+="KOT : "+SESSION.order.id+"\n";
    kot+="DATE: "+formatDate(SESSION.order.createdAt)+"\n";
    kot+="TABLE: "+SESSION.customer.table+"\n";
    kot+="NAME : "+SESSION.customer.name+"\n";
    kot+=line(width)+"\n";

    SESSION.cart.forEach(item=>{
        kot+=item.qty+" x "+item.name+"\n";
    });

    // FIX: Add cooking instructions to KOT if they exist
    if(SESSION.order.notes && SESSION.order.notes.trim() !== "") {
        kot+=line(width)+"\n";
        kot+="NOTES:\n"+SESSION.order.notes+"\n";
    }

    kot+=line(width)+"\n";
    kot+=centerText("END OF KOT",width);

    return kot;
}


/*=========================================================
THERMAL BILL
=========================================================*/

function generateBill(){

    calculateBill();

    const width=

    CONFIG.UI.THERMAL_WIDTH;

    let bill="";

    bill+=centerText(

        SETTINGS.Name||

        CONFIG.RESTAURANT.NAME,

        width

    )+"\n";

    if(SETTINGS.Tagline){

        bill+=centerText(

            SETTINGS.Tagline,

            width

        )+"\n";

    }

    if(SETTINGS.Address){

        bill+=

        SETTINGS.Address+

        "\n";

    }

    if(SETTINGS.GSTIN){

        bill+=

        "GSTIN : "+

        SETTINGS.GSTIN+

        "\n";

    }

    bill+=line(width)+"\n";

    bill+="Bill : "+SESSION.order.id+"\n";

    bill+="Date : "+formatDate(

        SESSION.order.createdAt

    )+"\n";

    bill+="Customer : "+SESSION.customer.name+"\n";

    bill+="Table : "+SESSION.customer.table+"\n";

    bill+=line(width)+"\n";

    SESSION.cart.forEach(item=>{

        bill+=billLine(

            item.qty+

            " x "+

            item.name,

            formatMoney(

                item.qty*

                item.price

            ),

            width

        )+"\n";

    });

    bill+=line(width)+"\n";

    bill+=billLine(

        "Subtotal",

        formatMoney(

            SESSION.order.subtotal

        ),

        width

    )+"\n";

    if(

        SESSION.order.discount>0

    ){

        bill+=billLine(

            "Discount",

            "-"+formatMoney(

                SESSION.order.discount

            ),

            width

        )+"\n";

    }

    bill+=billLine(

        "GST",

        formatMoney(

            SESSION.order.gst

        ),

        width

    )+"\n";

    bill+=line(width)+"\n";

    bill+=billLine(

        "TOTAL",

        formatMoney(

            SESSION.order.total

        ),

        width

    )+"\n";

    bill+=line(width)+"\n";

    bill+=centerText(

        "Thank You!",

        width

    );

    return bill;

}
/*=========================================================
PRINT HELPERS
=========================================================*/

function printBill(){

    const area=

    document.createElement(

    "div"

    );

    area.innerHTML=

    "<pre>"+

    generateBill()+

    "</pre>";

    document.body

    .appendChild(area);

    window.print();

    document.body

    .removeChild(area);

}

function printKOT(){

    const area=

    document.createElement(

    "div"

    );

    area.innerHTML=

    "<pre>"+

    generateKOT()+

    "</pre>";

    document.body

    .appendChild(area);

    window.print();

    document.body

    .removeChild(area);

}

/*=========================================================
WHATSAPP MESSAGE
=========================================================*/
function generateWhatsAppMessage(){
    const orderData = SESSION.lastPlacedOrder || SESSION.order;
    const cartItems = (SESSION.lastPlacedOrder ? SESSION.lastPlacedOrder.cart : SESSION.cart) || [];

    let msg = "🍽 *NEW ORDER*\n\n";
    msg += "*Order:* " + (orderData.id || "") + "\n";
    msg += "*Customer:* " + (SESSION.customer.name || "") + "\n";
    msg += "*Table:* " + (SESSION.customer.table || "") + "\n\n";

    cartItems.forEach(item => {
        msg += item.qty + " × " + item.name + "\n";
    });

    if(orderData.notes && orderData.notes.trim() !== "") {
        msg += "\n*Notes:* " + orderData.notes + "\n";
    }

    msg += "\n*Total:* " + formatMoney(orderData.total);
    return msg;
}

function openWhatsApp(){
    if(!SETTINGS.WhatsApp) return;
    const cleanNumber = String(SETTINGS.WhatsApp).replace(/\D/g, '');
    window.open(
        "https://wa.me/" + cleanNumber + "?text=" + encodeURIComponent(generateWhatsAppMessage()),
        "_blank"
    );
}
/*=========================================================
RESTAURANT HELPERS
=========================================================*/

function restaurantName(){

    return(

        SETTINGS.Name||

        CONFIG.RESTAURANT.NAME

    );

}

function restaurantGST(){

    return Number(

        SETTINGS.GSTPercent||

        0

    );

}

function restaurantUPI(){

    return(

        SETTINGS.UPI||

        ""

    );

}

/*=========================================================
ANALYTICS
=========================================================*/

function calculateRevenue(

orders

){

    let total=0;

    orders.forEach(order=>{

        total+=

        Number(

            order.total

        );

    });

    return total;

}

function calculateAverageBill(

orders

){

    if(

        orders.length===0

    ){

        return 0;

    }

    return(

        calculateRevenue(

            orders

        )/

        orders.length

    );

}

function calculatePendingOrders(

orders

){

    return orders.filter(

        order=>

        order.status===

        "Pending"

    ).length;

}

function calculateCompletedOrders(

orders

){

    return orders.filter(

        order=>

        order.status===

        "Served"

    ).length;

}
/*=========================================================
ORDER HELPERS
=========================================================*/

async function fetchMenu(){

    return await api(

        "getMenu"

    );

}

async function fetchOrders(){

    return await api(

        "getOrders"

    );

}

async function updateOrderStatus(

    orderId,

    status

){

    return await api(

        "updateOrderStatus",

        {

            orderId:orderId,

            status:status

        }

    );

}

/*=========================================================
SEARCH HELPERS
=========================================================*/

function searchOrders(

    orders,

    keyword

){

    keyword=(

        keyword||

        ""

    )

    .toLowerCase();

    return orders.filter(order=>

        contains(

            order.id,

            keyword

        )

        ||

        contains(

            order.customer,

            keyword

        )

        ||

        contains(

            order.table,

            keyword

        )

    );

}

/*=========================================================
NOTIFICATION
=========================================================*/


function detectNewOrders(
    orders

){
    if(

        orders.length>

        LAST_ORDER_COUNT
    ){
        console.log(

            "New order received."

        );

    }

    LAST_ORDER_COUNT=

    orders.length;

}

/*=========================================================
DATE HELPERS
=========================================================*/

function today(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function currentTime(){

    return new Date()

    .toLocaleTimeString(

        "en-IN"

    );

}

/*=========================================================
APPLICATION READY
=========================================================*/

window.addEventListener(

"load",

()=>{

    console.log(

    CONFIG.APP.NAME+

    " v"+

    CONFIG.APP.VERSION+

    " Ready"

    );

}

);

function goTo(page){
    location.href = page + window.location.search;
}
