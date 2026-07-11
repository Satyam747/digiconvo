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
API
=========================================================*/
async function api(action, data = {}) {

    const controller = new AbortController();

    const timer = setTimeout(() => {

        controller.abort();

    }, CONFIG.API.TIMEOUT);

    try {

        const formData = new URLSearchParams();

        formData.append(
            "data",
            JSON.stringify({
                action: action,
                ...data
            })
        );

        const start = performance.now();

const response = await fetch(
            CONFIG.API.URL,
            {
                method: "POST",
                body: formData,
                signal: controller.signal
            }
        );

        clearTimeout(timer);

        const text = await response.text();

console.log(
    action,
    (performance.now() - start).toFixed(0) + " ms"
);

        return JSON.parse(text);

    }
    catch(error){

    clearTimeout(timer);

    console.error(error);

    return{

            success:false,

            message:error.toString()

        };

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

    return "ORD"+

    Date.now();

}

function currentDateTime(){

    return new Date()

    .toLocaleString(

        "en-IN",

        {

            timeZone:

            "Asia/Kolkata"

        }

    );

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
    let msg="";

    msg+="🍽 *NEW ORDER*%0A%0A";
    msg+="*Order:* "+SESSION.order.id+"%0A";
    msg+="*Customer:* "+SESSION.customer.name+"%0A";
    msg+="*Table:* "+SESSION.customer.table+"%0A%0A";

    SESSION.cart.forEach(item=>{
        msg+=item.qty+" × "+item.name+"%0A";
    });

    // FIX: Append notes to WhatsApp message
    if(SESSION.order.notes && SESSION.order.notes.trim() !== "") {
        msg+="%0A*Notes:* "+encodeURIComponent(SESSION.order.notes)+"%0A";
    }

    msg+="%0A*Total:* "+formatMoney(SESSION.order.total);
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