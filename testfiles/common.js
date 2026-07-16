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
let LAST_ORDER_COUNT=0;
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
        const data = localStorage.getItem(CONFIG.STORAGE.SESSION);
        if(data){
            // Check if data is valid JSON before parsing
            if (data.startsWith('{') || data.startsWith('[')) {
                SESSION = JSON.parse(data);
            } else {
                resetSession();
            }
        } else {
            saveSession();
        }
    }
    catch(error){
        // Optionally log but don't show the full error
        console.warn("Session corrupted, resetting.");
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
            case "getSettings": 
                result = await supabaseClient.from('settings').select('*').eq('id', 1).single();
                return {
                    success: !result.error,
                    Name: result.data?.restaurant_name, Tagline: result.data?.tagline,
                    Address: result.data?.address, Phone: result.data?.phone,
                    Logo: result.data?.logo_url, GST: result.data?.gst_percent,
                    Currency: result.data?.currency, UPI: result.data?.upi_id,
                    WhatsApp: result.data?.whatsapp_number, ReviewLink: result.data?.review_link,
                    AdminPIN: String(result.data?.admin_pin || "1234"), StaffPIN: String(result.data?.staff_pin || "0000"),
                    AutoRefresh: result.data?.auto_refresh, PrinterWidth: result.data?.printer_width,
                    HappyHourEnabled: result.data?.happy_hour_enabled ? "TRUE" : "FALSE"
                };

            case "saveSettings": 
                result = await supabaseClient.from('settings').update({
                    restaurant_name: data.Name, tagline: data.Tagline, address: data.Address,
                    phone: data.Phone, logo_url: data.Logo, gst_percent: Number(data.GST),
                    currency: data.Currency, upi_id: data.UPI, whatsapp_number: data.WhatsApp,
                    review_link: data.ReviewLink, auto_refresh: Number(data.AutoRefresh),
                    printer_width: Number(data.PrinterWidth), happy_hour_enabled: data.HappyHourEnabled === "TRUE",
                    admin_pin: data.AdminPIN, staff_pin: data.StaffPIN
                }).eq('id', 1);
                return { success: !result.error, message: result.error?.message };

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
                    if (row.offer_type && row.offer_type !== 'None') {
                        const days = row.offer_days || [];
                        const validDay = days.length === 0 || days.includes(currentDay);
                        let validTime = true;
                                                if (row.start_time && row.end_time) {
                            if (row.start_time <= row.end_time) {
                                validTime = (currentTimeString >= row.start_time && currentTimeString <= row.end_time);
                            } else {
                                // Handles overnight offers (e.g., 22:00 to 02:00)
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

                return {
    id: row.id, category: row.category, name: row.name, description: row.description,
    originalPrice: originalPrice, price: finalPrice, image: row.image_url,
    available: row.available, veg: row.veg,
    OfferType: isOfferActive ? row.offer_type : 'None', OfferValue: row.offer_value, 
    StartTime: row.start_time, EndTime: row.end_time, OfferDays: row.offer_days || [],
    stock: row.stock,
    stockThreshold: row.stock_threshold,
    ID: row.id, Category: row.category, Name: row.name, Description: row.description,
    OriginalPrice: originalPrice, Price: finalPrice, Image: row.image_url,
    Available: row.available, Veg: row.veg,
    Stock: row.stock,
    StockThreshold: row.stock_threshold
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
        veg: data.Veg !== undefined ? data.Veg : true,
        stock: data.Stock !== undefined ? Number(data.Stock) : 999,
        stock_threshold: data.StockThreshold !== undefined ? Number(data.StockThreshold) : 10
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

              case "placeOrder": 
            if (!data.cart || data.cart.length === 0) {
                return { success: false, message: "Cannot process an empty order." };
            }

            let orderId = data.order.id;
            const isAdditional = data.isAdditionalOrder || false;

            // --- 🔒 SECURE PRICE & OFFER RECALCULATION ---
            // Fetch live menu and settings directly from the database
            const { data: liveMenu, error: menuFetchErr } = await supabaseClient.from('menu').select('*');
            const { data: settingsData } = await supabaseClient.from('settings').select('gst_percent').eq('id', 1).single();
            const gstRate = settingsData ? Number(settingsData.gst_percent || 0) : 0;
            
            if(menuFetchErr || !liveMenu) return { success: false, message: "Could not fetch secure menu prices." };

            const now = new Date();
            const currentDay = now.toLocaleDateString('en-US', { weekday: 'short' }); 
            const currentTimeString = now.toTimeString('en-US', { hour12: false }).substring(0, 5);

            // Forcefully override the cart prices with REAL database prices
            data.cart = data.cart.map(cartItem => {
                const realItem = liveMenu.find(m => m.id === cartItem.id);
                if (!realItem) throw new Error(`Item ${cartItem.name} is no longer available.`);

                let finalPrice = Number(realItem.price);
                let originalPrice = Number(realItem.original_price || realItem.price);
                
                // Re-calculate offers securely on the backend layer
                if (realItem.offer_type && realItem.offer_type !== 'None') {
                    const days = realItem.offer_days || [];
                    const validDay = days.length === 0 || days.includes(currentDay);
                    let validTime = true;
                    if (realItem.start_time && realItem.end_time) {
                        if (realItem.start_time <= realItem.end_time) {
                            validTime = (currentTimeString >= realItem.start_time && currentTimeString <= realItem.end_time);
                        } else {
                            validTime = (currentTimeString >= realItem.start_time || currentTimeString <= realItem.end_time);
                        }
                    }
                    if (validDay && validTime) {
                        if (realItem.offer_type === 'Flat') {
                            finalPrice = Math.max(0, originalPrice - Number(realItem.offer_value));
                        } else { 
                            finalPrice = Math.max(0, originalPrice - (originalPrice * Number(realItem.offer_value) / 100));
                        }
                    }
                }

                // Return the item with secure prices injected (overwriting the user's fake prices)
                return {
                    ...cartItem,
                    price: finalPrice,
                    originalPrice: originalPrice
                };
            });
            // --- END SECURE PRICE OVERRIDE ---

            // --- Helper to validate stock ---
            async function validateStock(cartItems) {
                for (let item of cartItems) {
                    const realItem = liveMenu.find(m => m.id === item.id);
                    if (!realItem) return { success: false, message: `Item ${item.name} not found.` };
                    if ((realItem.stock || 0) < item.qty) {
                        return { success: false, message: `Insufficient stock for ${item.name}. Available: ${realItem.stock}` };
                    }
                }
                return { success: true };
            }

            // --- Helper to deduct stock ---
            async function deductStock(cartItems) {
                for (let item of cartItems) {
                    const realItem = liveMenu.find(m => m.id === item.id);
                    if (realItem) {
                        const newStock = Math.max(0, (realItem.stock || 0) - item.qty);
                        await supabaseClient.from('menu').update({ stock: newStock }).eq('id', item.id);
                    }
                }
            }

            // --- If additional order, merge with existing ---
            if (isAdditional && orderId) {
                const { data: existingOrder, error: fetchError } = await supabaseClient
                    .from('orders')
                    .select('cart, status, notes')
                    .eq('id', orderId)
                    .single();

                if (fetchError) return { success: false, message: "Could not fetch existing order." };

                const existingCart = existingOrder.cart || [];
                const newCart = data.cart;
                const newItems = newCart.filter(item => item.isNew === true);
                
                if (newItems.length > 0) {
                    const stockCheck = await validateStock(newItems);
                    if (!stockCheck.success) return stockCheck;
                }

                newCart.forEach(newItem => {
                    existingCart.push({ ...newItem, isNew: true });
                });

                // Securely Recalculate Combined Totals
                let secureSubtotal = 0;
                let secureDiscount = 0;
                existingCart.forEach(item => {
                    secureSubtotal += (item.price * item.qty);
                    if (item.originalPrice && item.originalPrice > item.price) {
                        secureDiscount += ((item.originalPrice - item.price) * item.qty);
                    }
                });
                const secureGst = secureSubtotal * gstRate / 100;
                const secureTotal = secureSubtotal + secureGst;

                let newStatus = existingOrder.status;
                if (newItems.length > 0 && (newStatus === 'Ready' || newStatus === 'Served')) {
                    newStatus = 'Pending';
                }

                const { error: updateError } = await supabaseClient.from('orders').update({
                    cart: existingCart,
                    subtotal: secureSubtotal,
                    discount: secureDiscount,
                    gst: secureGst,
                    total: secureTotal,
                    updated_at: new Date().toISOString(),
                    notes: data.order.notes || existingOrder.notes,
                    status: newStatus
                }).eq('id', orderId);

                if (updateError) return { success: false, message: "Failed to update order: " + updateError.message };

                if (newItems.length > 0) await deductStock(newItems);

                return { success: true, orderId, message: "Order updated" };
            }

            // --- Normal order creation (first order) ---
            const stockCheck = await validateStock(data.cart);
            if (!stockCheck.success) return stockCheck;

            // Securely Calculate New Totals
            let secSubtotal = 0;
            let secDiscount = 0;
            data.cart.forEach(item => {
                secSubtotal += (item.price * item.qty);
                if (item.originalPrice && item.originalPrice > item.price) {
                    secDiscount += ((item.originalPrice - item.price) * item.qty);
                }
            });
            const secGst = secSubtotal * gstRate / 100;
            const secTotal = secSubtotal + secGst;

            const uniqueStr = Math.random().toString(36).substring(2, 6).toUpperCase();
            const invNo = "INV-" + Date.now() + "-" + uniqueStr;
            const kotNo = "KOT-" + Date.now() + "-" + uniqueStr;

            const orderResult = await supabaseClient.from('orders').insert({
                id: orderId,
                customer_name: data.customer.name,
                table_number: data.customer.table,
                cart: data.cart,
                subtotal: secSubtotal,  // Using secure calculation
                discount: secDiscount,  // Using secure calculation
                gst: secGst,            // Using secure calculation
                total: secTotal,        // Using secure calculation
                payment_mode: data.order.paymentMode,
                status: 'Pending',
                invoice_no: invNo,
                kot_no: kotNo,
                notes: data.order.notes || ''
            });

            if (orderResult.error) return { success: false, message: orderResult.error.message };

            await supabaseClient.from('tables').update({
                status: 'Occupied',
                current_order_id: orderId
            }).eq('table_number', data.customer.table);

            await deductStock(data.cart);

            return { success: true, orderId, invoiceNo: invNo, kotNo };


case "getOrders": 
    const ordToday = new Date();
    ordToday.setHours(0,0,0,0);
    result = await supabaseClient.from('orders').select('*').gte('created_at', ordToday.toISOString()).order('created_at', { ascending: false });
    const legacyOrders = (result.data || []).map(row => ({

        id: row.id, 
        // CHANGE THIS LINE: Keep the raw timestamp for accurate math
        dateTime: row.created_at, 
        customer: row.customer_name, table: row.table_number, cart: row.cart,
        subtotal: row.subtotal, discount: row.discount, gst: row.gst, total: row.total,
        payment: row.payment_mode, status: row.status, invoiceNo: row.invoice_no,
        kotNo: row.kot_no, notes: row.notes
    }));
    return { success: !result.error, data: legacyOrders };


            case "getOrderStatus": 
                result = await supabaseClient.from('orders').select('*').eq('id', data.orderId).single();
                return {
                    success: !result.error, status: result.data?.status,
                    orderId: result.data?.id, payment: result.data?.payment_mode,
                    total: result.data?.total, invoiceNo: result.data?.invoice_no, kotNo: result.data?.kot_no
                };

            case "updateOrderStatus": 
    // 1. Fetch the order to get the table number and current status
    const orderFetch = await supabaseClient
        .from('orders')
        .select('table_number, status')
        .eq('id', data.orderId)
        .single();

    if (orderFetch.error) {
        return { 
            success: false, 
            message: "Failed to fetch order: " + orderFetch.error.message 
        };
    }

    // Store original status before updating
    const originalStatus = orderFetch.data.status;
    const tableNumber = String(orderFetch.data.table_number);

    // 2. Update the order status
    const orderUpdate = await supabaseClient
        .from('orders')
        .update({ status: data.status })
        .eq('id', data.orderId);

    if (orderUpdate.error) {
        return { 
            success: false, 
            message: "Failed to update order: " + orderUpdate.error.message 
        };
    }

    // 3. Update the table status
    let tableUpdate;
    if (['Cancelled', 'Completed'].includes(data.status)) {
        // Free the table
        tableUpdate = await supabaseClient
            .from('tables')
            .update({ 
                status: 'Free', 
                current_order_id: null 
            })
            .eq('table_number', tableNumber);
            
        // --- 📦 RESTORE STOCK IF CANCELLED ---
        // Only restore stock if the order was Pending or Preparing (items not yet served)
        if (data.status === 'Cancelled' && (originalStatus === 'Pending' || originalStatus === 'Preparing')) {
            // Fetch the order cart
            const orderData = await supabaseClient
                .from('orders')
                .select('cart')
                .eq('id', data.orderId)
                .single();
            if (orderData.data && orderData.data.cart) {
                for (let item of orderData.data.cart) {
                    const stockCheck = await supabaseClient
                        .from('menu')
                        .select('stock')
                        .eq('id', item.id)
                        .single();
                    if (!stockCheck.error) {
                        const newStock = (stockCheck.data.stock || 0) + item.qty;
                        await supabaseClient
                            .from('menu')
                            .update({ stock: newStock })
                            .eq('id', item.id);
                    }
                }
            }
        }
        // --- END OF RESTORE ---
    } else {
        // Keep occupied for Pending, Preparing, Ready, Served
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

            case "releaseTable": 
                result = await supabaseClient.from('tables').update({ status: 'Free', current_order_id: null }).eq('table_number', data.table);
                return { success: !result.error };

                        case "getDashboard": 
                const dashToday = new Date();
                dashToday.setHours(0,0,0,0);
                const rawOrders = await supabaseClient.from('orders').select('*').gte('created_at', dashToday.toISOString()).order('created_at', { ascending: false });

                let revenue = 0; let activeTblsCount = 0;
                                (rawOrders.data || []).forEach(o => {
                    if (o.status !== 'Cancelled') revenue += Number(o.total);
                    if (['Pending', 'Preparing', 'Ready', 'Served'].includes(o.status)) activeTblsCount++;
                });

                const formattedDashOrders = (rawOrders.data || []).map(row => ({
                    id: row.id, customer: row.customer_name, table: row.table_number, total: row.total, status: row.status, cart: row.cart
                }));
                return { success: true, data: { totalOrders: (rawOrders.data || []).length, activeTables: activeTblsCount, revenue: revenue, orders: formattedDashOrders } };

                        case "getReports": 
                const repToday = new Date();
                repToday.setHours(0,0,0,0);
                const reportsOrders = await supabaseClient.from('orders').select('*').gte('created_at', repToday.toISOString());

                let totalRevenue = 0, cashRev = 0, upiRev = 0; const salesMap = {};
                (reportsOrders.data || []).forEach(o => {
                    if (o.status === 'Cancelled') return;
                    totalRevenue += Number(o.total);
                    if (o.payment_mode.toUpperCase() === 'CASH') cashRev += Number(o.total);
                    else upiRev += Number(o.total);
                    o.cart.forEach(i => { salesMap[i.name] = (salesMap[i.name] || 0) + Number(i.qty || 1); });
                });
                const topItems = Object.keys(salesMap).map(n => ({ name: n, quantity: salesMap[n] })).sort((a, b) => b.quantity - a.quantity);
                return { success: true, data: { totalOrders: (reportsOrders.data || []).length, totalRevenue: totalRevenue, averageBill: (reportsOrders.data || []).length ? (totalRevenue / (reportsOrders.data || []).length) : 0, cashRevenue: cashRev, upiRevenue: upiRev, popularItems: topItems } };

                  case "getActivity": 
    // Try standard schema first
    result = await supabaseClient.from('activity_log').select('*').order('created_at', { ascending: false }).limit(50);
    
    // Fallback: If it fails, auto-adapt to use your custom 'time' column
    if (result.error && result.error.message.includes("created_at")) {
        result = await supabaseClient.from('activity_log').select('*').order('time', { ascending: false }).limit(50);
    }
    
    const legacyActivity = (result.data || []).map(row => ({
        time: row.created_at || row.time, 
        user: row.user_role || 'System', 
        action: row.action, details: row.details, icon: "fa-solid fa-circle-info"
    }));
    return { success: !result.error, data: legacyActivity, message: result.error?.message };




            case "addActivity": 
                result = await supabaseClient.from('activity_log').insert({ action: data.title, details: data.description });
                return { success: !result.error };

                        case "getBill": 
                const billOrderReq = await supabaseClient.from('orders').select('*').eq('id', data.id).single();
                const billSettingsReq = await supabaseClient.from('settings').select('*').eq('id', 1).single();
                if (billOrderReq.error) return { success: false, message: "Order not found." };
                const billOrder = billOrderReq.data; const bSet = billSettingsReq.data; let billRows = "";
                (billOrder.cart || []).forEach(item => { billRows += `<tr><td>${escapeHTML(item.name)}</td><td style="text-align:center">${item.qty}</td><td style="text-align:right">₹${item.price}</td><td style="text-align:right">₹${item.price*item.qty}</td></tr>`; });
                const billHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice</title><style>body{font-family:monospace;padding:20px;font-size:14px;}table{width:100%;border-collapse:collapse;}th,td{padding:6px;border-bottom:1px dashed #999;}.center{text-align:center;}.right{text-align:right;}h2{margin:0;}hr{border:none;border-top:1px dashed black;margin:10px 0;}@media print{button{display:none;}}</style></head><body><div class="center"><h2>${escapeHTML(bSet.restaurant_name)|| "Restaurant"}</h2><div>${escapeHTML(bSet.address)||""}</div><div>${escapeHTML(bSet.phone)||""}</div></div><hr><div><b>Invoice :</b> ${billOrder.invoice_no}<br><b>Order :</b> ${billOrder.id}<br><b>KOT :</b> ${billOrder.kot_no}<br><b>Date :</b> ${new Date(billOrder.created_at).toLocaleString('en-IN')}<br><b>Customer :</b> ${escapeHTML(billOrder.customer_name)}<br><b>Table :</b> ${escapeHTML(billOrder.table_number)}<br><b>Payment :</b> ${escapeHTML(billOrder.payment_mode)}<br></div><hr><table><thead><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Total</th></tr></thead><tbody>${billRows}</tbody></table><hr><table><tr><td>Subtotal</td><td class="right">₹${Number(billOrder.subtotal).toFixed(2)}</td></tr><tr><td>Discount</td><td class="right">₹${Number(billOrder.discount).toFixed(2)}</td></tr><tr><td>GST</td><td class="right">₹${Number(billOrder.gst).toFixed(2)}</td></tr><tr><td><b>Grand Total</b></td><td class="right"><b>₹${Number(billOrder.total).toFixed(2)}</b></td></tr></table><hr><div class="center">Thank You<br>Visit Again</div><script>window.onload=function(){window.print();};</script></body></html>`;
                return { success: true, html: billHtml };


                        case "getKOT": 
                const kotOrderReq = await supabaseClient.from('orders').select('*').eq('id', data.id).single();
                const kotSettingsReq = await supabaseClient.from('settings').select('*').eq('id', 1).single();
                if (kotOrderReq.error) return { success: false, message: "Order not found." };
                const kotOrder = kotOrderReq.data; const kSet = kotSettingsReq.data; let kotRows = "";
                (kotOrder.cart || []).forEach(item => { kotRows += `<tr><td align="left">${escapeHTML(item.name)}</td><td align="right"><b>${item.qty}</b></td></tr>`; });
                let notesHtml = ""; if (kotOrder.notes && kotOrder.notes !== "") { notesHtml = `<hr><div style="border: 1px solid black; padding: 8px; margin-top: 10px;"><b>NOTES:</b><br>${escapeHTML(kotOrder.notes).replace(/\n/g, '<br>')}</div>`; }
                const kotHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>KOT - ${kotOrder.id}</title><style>body { font-family: monospace; padding: 20px; font-size: 16px; margin: 0; } .center { text-align: center; } table { width: 100%; border-collapse: collapse; margin-top: 15px; } td { padding: 8px; border-bottom: 1px dashed #888; } hr { border: none; border-top: 1px dashed black; margin: 12px 0; } @media print { body { padding: 0; } }</style></head><body><div class="center"><h2>${escapeHTML(kSet.restaurant_name) || "Restaurant"}</h2><h3>KITCHEN ORDER TICKET</h3></div><hr><div><b>KOT :</b> ${kotOrder.kot_no}<br><b>Order :</b> ${kotOrder.id}<br><b>Table :</b> ${escapeHTML(kotOrder.table_number)}<br><b>Customer :</b> ${escapeHTML(kotOrder.customer_name)}<br><b>Time :</b> ${new Date(kotOrder.created_at).toLocaleString('en-IN')}</div><hr><table><thead><tr><th align="left">Item</th><th align="right">Qty</th></tr></thead><tbody>${kotRows}</tbody></table>${notesHtml}<hr><div class="center"><b>PREPARE IMMEDIATELY</b></div><script>window.onload = function() { window.print(); };</script></body></html>`;
                return { success: true, html: kotHtml };

                            case "updateTableStatus": 
                result = await supabaseClient.from('tables').update({ status: data.status }).eq('table_number', data.table);
                return { success: !result.error };


             case "closeDay": 
    try {
        // 1. Delete all orders from today (optional – but we want to reset)
        const today = new Date();
        today.setHours(0,0,0,0);
        const { error: delError } = await supabaseClient
            .from('orders')
            .delete()
            .gte('created_at', today.toISOString());
        if (delError) return { success: false, message: delError.message };

        // 2. Reset all tables to 'Free' and clear current_order_id
        const { error: tblError } = await supabaseClient
            .from('tables')
            .update({ status: 'Free', current_order_id: null })
            .neq('table_number', '');  // update all rows
        if (tblError) return { success: false, message: tblError.message };

        return { success: true, message: "Day closed successfully." };
    } catch(err) {
        return { success: false, message: err.toString() };
    }

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

    if(

        Object.keys(

            SETTINGS

        ).length

    ){

        return SETTINGS;

    }

    const response=

    await api(

        "getSettings"

    );

    if(response.success){

    SETTINGS = { ...response };

    delete SETTINGS.success;

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
    return (str || '').toString().replace(/[&<>'"]/g, tag => ({
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
=========================================================*/

function requireSession(){

    loadSession();

    if(

        isBlank(

            SESSION.customer.name

        )

        ||

        isBlank(

            SESSION.customer.table

        )

    ){

        location.href=

        CONFIG.ROUTES.INDEX;

    }

}

function requireCart(){

    loadSession();

    if(

        SESSION.cart.length===0

    ){

        location.href=

        CONFIG.ROUTES.MENU;

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

        item=>item.id===id

    );

}

function getCartQuantity(id){
    loadSession();
    let total = 0;
    SESSION.cart.forEach(item => {
        if (item.id === id) total += item.qty;
    });
    return total;
}
/*=========================================================
ADD ITEM
=========================================================*/

function addToCart(item){
    loadSession();
    const isExistingOrder = !isBlank(SESSION.order.id);
    const uniqueId = item.id + '_' + Date.now() + '_' + Math.random().toString(36).substr(2,4);
    if (!isExistingOrder) {
        // First order: merge by id
        const existing = SESSION.cart.find(cartItem => cartItem.id === item.id);
        if(existing){
            existing.qty++;
        } else {
            SESSION.cart.push({
                cartItemId: uniqueId,
                id: item.id,
                name: item.name,
                category: item.category || "",
                description: item.description || "",
                image: imageOrDefault(item.image),
                price: toNumber(item.price),
                originalPrice: toNumber(item.originalPrice || item.price),
                qty: 1,
                isNew: false
            });
        }
    } else {
        // Existing order: always add a new separate entry
        SESSION.cart.push({
            cartItemId: uniqueId,
            id: item.id,
            name: item.name,
            category: item.category || "",
            description: item.description || "",
            image: imageOrDefault(item.image),
            price: toNumber(item.price),
            originalPrice: toNumber(item.originalPrice || item.price),
            qty: 1,
            isNew: true
        });
    }
    saveCart();
}
/*=========================================================
INCREASE DECREASE REMOVE FROM CART
=========================================================*/

function increaseQty(cartItemId){
    loadSession();
    const item = SESSION.cart.find(cartItem => cartItem.cartItemId === cartItemId);
    if(item){
        item.qty++;
        saveCart();
    }
}

function decreaseQty(cartItemId){
    loadSession();
    const item = SESSION.cart.find(cartItem => cartItem.cartItemId === cartItemId);
    if(!item) return;
    item.qty--;
    if(item.qty <= 0){
        const index = SESSION.cart.indexOf(item);
        if (index > -1) SESSION.cart.splice(index, 1);
        saveCart();
    } else {
        saveCart();
    }
}

function removeFromCart(cartItemId){
    loadSession();
    const index = SESSION.cart.findIndex(cartItem => cartItem.cartItemId === cartItemId);
    if (index > -1) {
        SESSION.cart.splice(index, 1);
        saveCart();
    }
}

function getCartItemIdForItem(itemId, preferNew = true){
    loadSession();
    if (preferNew) {
        const entry = SESSION.cart.find(cartItem => cartItem.id === itemId && cartItem.isNew === true);
        if (entry) return entry.cartItemId;
    }
    const entry = SESSION.cart.find(cartItem => cartItem.id === itemId);
    return entry ? entry.cartItemId : null;
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
    let subtotal=0;
    let discount=0;

    SESSION.cart.forEach(item=>{
        const price=toNumber(item.price);
        const original=toNumber(item.originalPrice||item.price);
        const qty=toNumber(item.qty);

        subtotal+=price*qty;
        discount+=(original-price)*qty;
    });

    // FIX: Look for both SETTINGS.GST and SETTINGS.GSTPercent
    const gstRate=toNumber(SETTINGS.GST||SETTINGS.GSTPercent||0);

    const gst=subtotal*gstRate/100;
    const total=subtotal+gst;

    SESSION.order.subtotal=subtotal;
    SESSION.order.discount=discount;
    SESSION.order.gst=gst;
    SESSION.order.total=total;
    SESSION.order.createdAt=currentDateTime();

    if(isBlank(SESSION.order.id)){
        SESSION.order.id=generateOrderID();
    }

    saveSession();

    return{
        subtotal:subtotal,
        discount:discount,
        gst:gst,
        total:total
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
    kot+="NOTES:\n"+escapeHTML(SESSION.order.notes)+"\n"; 
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
    let msg = "";

    // Header
    msg += "🍽️ *NEW ORDER*\n\n";

    // Order details
    msg += "*Order:* " + SESSION.order.id + "\n";
    msg += "*Customer:* " + SESSION.customer.name + "\n";
    msg += "*Table:* " + SESSION.customer.table + "\n\n";

    // Items list
    msg += "*Items:*\n";
    SESSION.cart.forEach(item => {
        msg += item.qty + " × " + item.name + "\n";
    });

    // Notes (if any)
    if(SESSION.order.notes && SESSION.order.notes.trim() !== "") {
        msg += "\n*Notes:* " + SESSION.order.notes + "\n";
    }

    // Total
    msg += "\n*Total:* " + formatMoney(SESSION.order.total);

    // Footer
    msg += "\n\nThank you for choosing us! 🙏";

    return msg;
}


function openWhatsApp(){
    if(!SETTINGS.WhatsApp){
        return;
    }
    const message = generateWhatsAppMessage();
    const encoded = encodeURIComponent(message);
    window.open(
        "https://wa.me/" + SETTINGS.WhatsApp + "?text=" + encoded,
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

    return new Date()

    .toLocaleDateString(

        "en-IN"

    );

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
// ===== MID-MEAL ORDER HELPERS =====
async function getActiveOrderForTable(tableNumber) {
    if (!tableNumber) return null;
    
    // 1. Look up the table to get the current_order_id
    const { data: tableData, error: tableError } = await supabaseClient
        .from('tables')
        .select('current_order_id')
        .eq('table_number', tableNumber)
        .single();
    
    if (tableError || !tableData?.current_order_id) return null;
    
    // 2. Fetch the order details
    const { data: orderData, error: orderError } = await supabaseClient
        .from('orders')
        .select('*')
        .eq('id', tableData.current_order_id)
        .single();
    
    if (orderError) return null;
    
    // 3. Only return if order is not final (Completed/Cancelled)
    if (['Completed', 'Cancelled'].includes(orderData.status)) return null;
    
    return orderData;
}

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
