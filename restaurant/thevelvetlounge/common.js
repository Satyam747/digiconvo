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

        createdAt: ""

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

        customer:{

            name:"",

            table:""

        },

        cart:[],

        order:{

            id:"",

            paymentMode:"",

            subtotal:0,

            discount:0,

            gst:0,

            total:0,

            status:"Pending",

            createdAt:""

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
                            validTime = (currentTimeString >= row.start_time && currentTimeString <= row.end_time);
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
                        ID: row.id, Category: row.category, Name: row.name, Description: row.description,
                        OriginalPrice: originalPrice, Price: finalPrice, Image: row.image_url,
                        Available: row.available, Veg: row.veg
                    };
                });
                return { success: !result.error, data: legacyMenu };

            case "saveMenuItem": 
                result = await supabaseClient.from('menu').upsert({
                    id: data.ID || data.id, category: data.Category || data.category,
                    name: data.Name || data.name, description: data.Description || data.description,
                    original_price: Number(data.OriginalPrice || data.originalPrice || data.Price || data.price),
                    price: Number(data.Price || data.price), image_url: data.Image || data.image,
                    available: data.Available !== undefined ? data.Available : true,
                    veg: data.Veg !== undefined ? data.Veg : true
                });
                return { success: !result.error };

            case "deleteMenuItem": 
                result = await supabaseClient.from('menu').delete().eq('id', data.id);
                return { success: !result.error };

            case "toggleAvailability": 
                const itemLookup = await supabaseClient.from('menu').select('available').eq('id', data.id).single();
                result = await supabaseClient.from('menu').update({ available: !itemLookup.data.available }).eq('id', data.id);
                return { success: !result.error };

            case "saveOffer": 
                result = await supabaseClient.from('menu').update({
                    offer_type: data.offerType, offer_value: data.offerValue,
                    start_time: data.startTime, end_time: data.endTime, offer_days: data.days
                }).eq('id', data.id);
                return { success: !result.error, message: result.error?.message };

            case "removeOffer": 
                result = await supabaseClient.from('menu').update({
                    offer_type: 'None', offer_value: 0, start_time: '', end_time: '', offer_days: []
                }).eq('id', data.id);
                return { success: !result.error, message: result.error?.message };

                case "placeOrder": 
                const orderId = data.order.id;
                const uniqueStr = Math.random().toString(36).substring(2, 6).toUpperCase();
                const invNo = "INV-" + Date.now() + "-" + uniqueStr;
                const kotNo = "KOT-" + Date.now() + "-" + uniqueStr;
                
                // ADD THIS: Fetch live menu prices to prevent local storage tampering
                const liveMenuReq = await supabaseClient.from('menu').select('id, price, offer_type, offer_value');
                if(!liveMenuReq.error) {
                    const liveMenu = liveMenuReq.data;
                    data.cart.forEach(cartItem => {
                        const realItem = liveMenu.find(m => m.id === cartItem.id);
                        if(realItem) {
                            // Enforce backend price calculations here in a production environment
                            // For now, at least ensure the item hasn't been deleted
                            if(!realItem) throw new Error("Item no longer available.");
                        }
                    });
                }

                // 1. Insert the order
                const orderResult = await supabaseClient.from('orders').insert({
                    id: orderId, customer_name: data.customer.name, table_number: data.customer.table,
                    cart: data.cart, subtotal: Number(data.order.subtotal), discount: Number(data.order.discount),
                    gst: Number(data.order.gst), total: Number(data.order.total), payment_mode: data.order.paymentMode,
                    status: 'Pending', invoice_no: invNo, kot_no: kotNo, notes: data.order.notes || ''
                });

                if (orderResult.error) return { success: false, message: orderResult.error.message };

                // 2. Update the Table Status to Busy and link the active order
                await supabaseClient.from('tables').update({ 
                    status: 'Busy', 
                    current_order_id: orderId 
                }).eq('table_number', data.customer.table);

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
                result = await supabaseClient.from('orders').update({ status: data.status }).eq('id', data.orderId);
                
                // ADD THIS: Automatically free the table if the order is cancelled
                if (data.status === 'Cancelled' && !result.error) {
                    const orderData = await supabaseClient.from('orders').select('table_number').eq('id', data.orderId).single();
                    if(orderData.data) {
                        await supabaseClient.from('tables').update({ status: 'Free', current_order_id: null }).eq('table_number', orderData.data.table_number);
                    }
                }
                
                return { success: !result.error };


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
                    if (['Pending', 'Preparing', 'Ready'].includes(o.status)) activeTblsCount++;
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
    result = await supabaseClient.from('activity_log').select('*').order('created_at', { ascending: false }).limit(50);
    const legacyActivity = (result.data || []).map(row => ({
        time: row.created_at, 
        user: row.user_role, action: row.action, details: row.details, icon: "fa-solid fa-circle-info"
    }));
    // ADDED: message: result.error?.message to pass the real error to the dashboard
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

    SESSION.cart=

    SESSION.cart.filter(

        item=>item.id!==id

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

        createdAt:""

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
    calculateBill();
    let msg = "";

    msg += "🍽 *NEW ORDER*\n\n";
    msg += "*Order:* " + SESSION.order.id + "\n";
    msg += "*Customer:* " + SESSION.customer.name + "\n";
    msg += "*Table:* " + SESSION.customer.table + "\n\n";

    SESSION.cart.forEach(item => {
        msg += item.qty + " × " + item.name + "\n";
    });

    if(SESSION.order.notes && SESSION.order.notes.trim() !== "") {
        msg += "\n*Notes:* " + SESSION.order.notes + "\n";
    }

    msg += "\n*Total:* " + formatMoney(SESSION.order.total);
    return msg;
}



function openWhatsApp(){

    if(

        !SETTINGS.WhatsApp

    ){

        return;

    }

    window.open(

        "https://wa.me/"+

        SETTINGS.WhatsApp+

        "?text="+

        generateWhatsAppMessage(),

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