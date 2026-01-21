import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type TranslationKey = keyof typeof translations.en;

const translations = {
  en: {
    // Navigation
    "nav.pos": "Point of Sale",
    "nav.tables": "Tables",
    "nav.kitchen": "Kitchen",
    "nav.inventory": "Inventory",
    "nav.reports": "Reports",
    "nav.settings": "Settings",
    "nav.logout": "Logout",
    
    // POS Page
    "pos.title": "Point of Sale",
    "pos.search": "Search products...",
    "pos.all_categories": "All",
    "pos.cart": "Cart",
    "pos.empty_cart": "Cart is empty",
    "pos.add_items": "Add items to get started",
    "pos.subtotal": "Subtotal",
    "pos.tax": "Tax",
    "pos.total": "Total",
    "pos.hold_order": "Hold Order",
    "pos.pay": "Pay",
    "pos.cash": "Cash",
    "pos.card": "Card",
    "pos.held_orders": "Held Orders",
    "pos.no_products": "No products found",
    "pos.add_products_settings": "Add products in Settings",
    
    // Payment
    "payment.title": "Payment",
    "payment.method": "Payment Method",
    "payment.cash_received": "Cash Received",
    "payment.change": "Change",
    "payment.complete": "Complete Payment",
    "payment.cancel": "Cancel",
    
    // Settings
    "settings.title": "Settings",
    "settings.subtitle": "Configure your business and POS system",
    "settings.business": "Business",
    "settings.categories": "Categories",
    "settings.products": "Products",
    "settings.users": "Users",
    "settings.floors": "Floors",
    "settings.tables": "Tables",
    "settings.printing": "Printing",
    "settings.invoicing": "Invoicing",
    
    // Business Settings
    "business.title": "Business Information",
    "business.subtitle": "Your business details shown on receipts",
    "business.name": "Business Name",
    "business.type": "Business Type",
    "business.address": "Address",
    "business.phone": "Phone",
    "business.currency": "Currency",
    "business.tax_rate": "Tax Rate",
    "business.language": "Language",
    "business.edit": "Edit",
    "business.save": "Save Changes",
    "business.cancel": "Cancel",
    "business.not_set": "Not set",
    
    // Products
    "products.title": "Products",
    "products.add": "Add Product",
    "products.edit": "Edit Product",
    "products.name": "Name",
    "products.price": "Price",
    "products.category": "Category",
    "products.sku": "SKU/Barcode",
    "products.description": "Description",
    "products.delete": "Delete",
    "products.no_products": "No products yet",
    "products.add_first": "Add your first product to get started",
    
    // Categories
    "categories.title": "Categories",
    "categories.add": "Add Category",
    "categories.edit": "Edit Category",
    "categories.name": "Name",
    "categories.color": "Color",
    "categories.no_categories": "No categories yet",
    "categories.add_first": "Add your first category",
    
    // Tables
    "tables.title": "Tables",
    "tables.add": "Add Table",
    "tables.capacity": "Capacity",
    "tables.status": "Status",
    "tables.free": "Free",
    "tables.occupied": "Occupied",
    "tables.dirty": "Dirty",
    "tables.reserved": "Reserved",
    
    // Kitchen
    "kitchen.title": "Kitchen Display",
    "kitchen.no_tickets": "No active tickets",
    "kitchen.waiting": "Waiting for orders",
    "kitchen.new": "New",
    "kitchen.preparing": "Preparing",
    "kitchen.ready": "Ready",
    "kitchen.served": "Served",
    
    // Inventory
    "inventory.title": "Inventory",
    "inventory.stock_levels": "Stock Levels",
    "inventory.product": "Product",
    "inventory.quantity": "Quantity",
    "inventory.adjust": "Adjust",
    "inventory.low_stock": "Low Stock",
    
    // Reports
    "reports.title": "Reports",
    "reports.dashboard": "Dashboard",
    "reports.today_sales": "Today's Sales",
    "reports.orders": "Orders",
    "reports.avg_order": "Average Order",
    "reports.top_products": "Top Products",
    "reports.sales_by_hour": "Sales by Hour",
    
    // Common
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.add": "Add",
    "common.loading": "Loading...",
    "common.error": "Error",
    "common.success": "Success",
    "common.confirm": "Confirm",
    "common.yes": "Yes",
    "common.no": "No",
    "common.back": "Back",
    "common.continue": "Continue",
    "common.search": "Search",
    "common.no_results": "No results found",
    "common.required": "Required",
    "common.optional": "Optional",
    
    // Login Page
    "login.title": "Sign In",
    "login.subtitle": "Sign in to your account to continue",
    "login.credentials_prompt": "Enter your credentials to access the system",
    "login.username": "Username",
    "login.username_placeholder": "Enter your username",
    "login.password": "Password",
    "login.password_placeholder": "Enter your password",
    "login.signing_in": "Signing in...",
    "login.sign_in": "Sign In",
    "login.no_account": "Don't have an account?",
    "login.register_link": "Register your business",
    "login.welcome_back": "Welcome back!",
    "login.login_success": "You have successfully logged in.",
    "login.login_failed": "Login failed",
    "login.invalid_credentials": "Invalid username or password.",
    "login.error": "Something went wrong. Please try again.",
    
    // Register Page
    "register.title": "Set up your business in minutes",
    "register.step_business": "Business Details",
    "register.step_admin": "Admin Account",
    "register.business_prompt": "Tell us about your business",
    "register.admin_prompt": "Create your administrator account",
    "register.business_name": "Business Name",
    "register.business_name_placeholder": "Enter your business name",
    "register.business_type": "Business Type",
    "register.type_retail": "Retail",
    "register.type_retail_desc": "Shops, stores",
    "register.type_restaurant": "Restaurant",
    "register.type_restaurant_desc": "Cafes, bars",
    "register.address": "Address",
    "register.address_placeholder": "Business address",
    "register.business_phone": "Business Phone",
    "register.your_name": "Your Name",
    "register.your_name_placeholder": "Enter your name",
    "register.email": "Email",
    "register.email_placeholder": "Enter your email",
    "register.phone": "Phone Number",
    "register.phone_placeholder": "Enter your phone number",
    "register.username": "Username",
    "register.username_placeholder": "Choose a username",
    "register.password": "Password",
    "register.password_placeholder": "Create a password",
    "register.confirm_password": "Confirm Password",
    "register.confirm_password_placeholder": "Confirm your password",
    "register.creating": "Creating...",
    "register.create_account": "Create Account",
    "register.have_account": "Already have an account?",
    "register.sign_in_link": "Sign in",
    "register.success": "Registration successful!",
    "register.success_message": "Your business has been set up. You can now log in.",
    "register.failed": "Registration failed",
    
    // POS Page - Additional
    "pos.search_barcode": "Search products or scan barcode...",
    "pos.no_products_filter": "Try adjusting your search or category filter",
    "pos.current_order": "Current Order",
    "pos.items": "items",
    "pos.no_items_yet": "No items yet",
    "pos.tap_to_add": "Tap products to add them to the order",
    "pos.each": "each",
    "pos.hold": "Hold",
    "pos.clear": "Clear",
    "pos.checkout": "Checkout",
    "pos.complete_payment": "Complete Payment",
    "pos.amount_due": "Amount Due",
    "pos.processing": "Processing...",
    "pos.complete_print": "Complete & Print",
    "pos.product_added": "Product added",
    "pos.added_to_cart": "added to cart",
    "pos.product_not_found": "Product not found",
    "pos.no_product_barcode": "No product found with barcode",
    "pos.order_completed": "Order completed!",
    "pos.order_success": "The order has been processed successfully.",
    "pos.order_error": "Failed to process order. Please try again.",
    "pos.order_number": "Order #",
    
    // Kitchen Page - Additional
    "kitchen.active_tickets": "active tickets",
    "kitchen.new_orders": "New Orders",
    "kitchen.no_active_orders": "No active orders",
    "kitchen.orders_appear_here": "New orders will appear here automatically",
    "kitchen.start_preparing": "Start Preparing",
    "kitchen.mark_ready": "Mark Ready",
    "kitchen.mark_served": "Mark Served",
    "kitchen.table": "Table",
    "kitchen.note": "Note",
    "kitchen.ticket_updated": "Ticket updated",
    "kitchen.ticket_moved_to": "Ticket moved to",
    
    // Tables Page - Additional
    "tables.subtitle": "Manage your floor plan and table assignments",
    "tables.kitchen_view": "Kitchen View",
    "tables.total_tables": "Total Tables",
    "tables.available": "Available",
    "tables.needs_cleaning": "Needs Cleaning",
    "tables.no_floors": "No floors configured",
    "tables.setup_floors": "Set up your floor plan in Settings to manage tables",
    "tables.add_floors": "Add Floors",
    "tables.no_tables_floor": "No tables on this floor",
    "tables.add_tables_settings": "Add tables in Settings",
    "tables.seats": "seats",
    "tables.table_cleaned": "Table cleaned",
    "tables.now_available": "is now available",
    "tables.legend_status": "Status:",
    
    // Inventory Page - Additional
    "inventory.subtitle": "Manage stock levels and track movements",
    "inventory.total_products": "Total Products",
    "inventory.out_of_stock": "Out of Stock",
    "inventory.in_stock": "In Stock",
    "inventory.history": "History",
    "inventory.search_placeholder": "Search by name, SKU, or barcode...",
    "inventory.no_sku": "No SKU",
    "inventory.barcode": "Barcode",
    "inventory.add_stock": "Add Stock",
    "inventory.remove_stock": "Remove Stock",
    "inventory.current_stock": "Current stock",
    "inventory.reason": "Reason",
    "inventory.notes": "Notes",
    "inventory.notes_optional": "Notes (Optional)",
    "inventory.notes_placeholder": "Add any notes about this adjustment",
    "inventory.saving": "Saving...",
    "inventory.stock_adjusted": "Stock adjusted",
    "inventory.stock_updated": "Inventory has been updated successfully.",
    "inventory.adjustment_error": "Failed to adjust stock. Please try again.",
    "inventory.purchase": "Purchase / Receiving",
    "inventory.adjustment": "Adjustment",
    "inventory.waste": "Waste / Damage",
    "inventory.no_movements": "No movements yet",
    "inventory.movements_appear": "Stock adjustments will appear here",
    "inventory.unknown_product": "Unknown Product",
    
    // Reports Page - Additional
    "reports.subtitle": "Sales analytics and business insights",
    "reports.vs_yesterday": "vs yesterday",
    "reports.today": "Today",
    "reports.per_order": "Per order",
    "reports.top_product": "Top Product",
    "reports.sold": "sold",
    "reports.overview": "Overview",
    "reports.sales": "Sales",
    "reports.sales_by_category": "Sales by Category",
    "reports.no_sales_data": "No sales data yet",
    "reports.make_sales": "Make some sales to see charts",
    "reports.no_category_data": "No category data yet",
    "reports.category_sales_appear": "Sales will be categorized here",
    "reports.top_selling": "Top Selling Products",
    "reports.units_sold": "units sold",
    "reports.revenue": "Revenue",
    "reports.top_products_appear": "Top products will appear here",
    
    // Sidebar - Additional
    "sidebar.navigation": "Navigation",
    "sidebar.dark_mode": "Dark Mode",
    "sidebar.light_mode": "Light Mode",
    "sidebar.user": "User",
    "sidebar.staff": "Staff",
    "sidebar.business": "Business",
    
    // Users Management
    "users.title": "Users",
    "users.add": "Add User",
    "users.edit": "Edit User",
    "users.name": "Name",
    "users.email": "Email",
    "users.phone": "Phone",
    "users.role": "Role",
    "users.pin": "PIN",
    "users.active": "Active",
    "users.no_users": "No users yet",
    "users.add_first": "Add your first user",
    "users.role_admin": "Administrator",
    "users.role_manager": "Manager",
    "users.role_cashier": "Cashier",
    "users.role_kitchen": "Kitchen",
    "users.delete_confirm": "Are you sure you want to delete this user?",
    "users.cannot_delete_self": "You cannot delete yourself",
    "users.created": "User created successfully",
    "users.updated": "User updated successfully",
    "users.deleted": "User deleted successfully",
  },
  es: {
    // Navigation
    "nav.pos": "Punto de Venta",
    "nav.tables": "Mesas",
    "nav.kitchen": "Cocina",
    "nav.inventory": "Inventario",
    "nav.reports": "Reportes",
    "nav.settings": "Configuración",
    "nav.logout": "Cerrar Sesión",
    
    // POS Page
    "pos.title": "Punto de Venta",
    "pos.search": "Buscar productos...",
    "pos.all_categories": "Todos",
    "pos.cart": "Carrito",
    "pos.empty_cart": "Carrito vacío",
    "pos.add_items": "Agregue productos para comenzar",
    "pos.subtotal": "Subtotal",
    "pos.tax": "Impuesto",
    "pos.total": "Total",
    "pos.hold_order": "Retener Orden",
    "pos.pay": "Pagar",
    "pos.cash": "Efectivo",
    "pos.card": "Tarjeta",
    "pos.held_orders": "Órdenes Retenidas",
    "pos.no_products": "No se encontraron productos",
    "pos.add_products_settings": "Agregue productos en Configuración",
    
    // Payment
    "payment.title": "Pago",
    "payment.method": "Método de Pago",
    "payment.cash_received": "Efectivo Recibido",
    "payment.change": "Cambio",
    "payment.complete": "Completar Pago",
    "payment.cancel": "Cancelar",
    
    // Settings
    "settings.title": "Configuración",
    "settings.subtitle": "Configure su negocio y sistema POS",
    "settings.business": "Negocio",
    "settings.categories": "Categorías",
    "settings.products": "Productos",
    "settings.users": "Usuarios",
    "settings.floors": "Pisos",
    "settings.tables": "Mesas",
    "settings.printing": "Impresión",
    "settings.invoicing": "Facturación",
    
    // Business Settings
    "business.title": "Información del Negocio",
    "business.subtitle": "Detalles de su negocio mostrados en recibos",
    "business.name": "Nombre del Negocio",
    "business.type": "Tipo de Negocio",
    "business.address": "Dirección",
    "business.phone": "Teléfono",
    "business.currency": "Moneda",
    "business.tax_rate": "Tasa de Impuesto",
    "business.language": "Idioma",
    "business.edit": "Editar",
    "business.save": "Guardar Cambios",
    "business.cancel": "Cancelar",
    "business.not_set": "No configurado",
    
    // Products
    "products.title": "Productos",
    "products.add": "Agregar Producto",
    "products.edit": "Editar Producto",
    "products.name": "Nombre",
    "products.price": "Precio",
    "products.category": "Categoría",
    "products.sku": "SKU/Código de Barras",
    "products.description": "Descripción",
    "products.delete": "Eliminar",
    "products.no_products": "Sin productos aún",
    "products.add_first": "Agregue su primer producto para comenzar",
    
    // Categories
    "categories.title": "Categorías",
    "categories.add": "Agregar Categoría",
    "categories.edit": "Editar Categoría",
    "categories.name": "Nombre",
    "categories.color": "Color",
    "categories.no_categories": "Sin categorías aún",
    "categories.add_first": "Agregue su primera categoría",
    
    // Tables
    "tables.title": "Mesas",
    "tables.add": "Agregar Mesa",
    "tables.capacity": "Capacidad",
    "tables.status": "Estado",
    "tables.free": "Libre",
    "tables.occupied": "Ocupada",
    "tables.dirty": "Sucia",
    "tables.reserved": "Reservada",
    
    // Kitchen
    "kitchen.title": "Pantalla de Cocina",
    "kitchen.no_tickets": "Sin tickets activos",
    "kitchen.waiting": "Esperando órdenes",
    "kitchen.new": "Nuevo",
    "kitchen.preparing": "Preparando",
    "kitchen.ready": "Listo",
    "kitchen.served": "Servido",
    
    // Inventory
    "inventory.title": "Inventario",
    "inventory.stock_levels": "Niveles de Stock",
    "inventory.product": "Producto",
    "inventory.quantity": "Cantidad",
    "inventory.adjust": "Ajustar",
    "inventory.low_stock": "Stock Bajo",
    
    // Reports
    "reports.title": "Reportes",
    "reports.dashboard": "Panel",
    "reports.today_sales": "Ventas de Hoy",
    "reports.orders": "Órdenes",
    "reports.avg_order": "Orden Promedio",
    "reports.top_products": "Productos Principales",
    "reports.sales_by_hour": "Ventas por Hora",
    
    // Common
    "common.save": "Guardar",
    "common.cancel": "Cancelar",
    "common.delete": "Eliminar",
    "common.edit": "Editar",
    "common.add": "Agregar",
    "common.loading": "Cargando...",
    "common.error": "Error",
    "common.success": "Éxito",
    "common.confirm": "Confirmar",
    "common.yes": "Sí",
    "common.no": "No",
  },
  pt: {
    // Navigation
    "nav.pos": "Ponto de Venda",
    "nav.tables": "Mesas",
    "nav.kitchen": "Cozinha",
    "nav.inventory": "Estoque",
    "nav.reports": "Relatórios",
    "nav.settings": "Configurações",
    "nav.logout": "Sair",
    
    // POS Page
    "pos.title": "Ponto de Venda",
    "pos.search": "Buscar produtos...",
    "pos.all_categories": "Todos",
    "pos.cart": "Carrinho",
    "pos.empty_cart": "Carrinho vazio",
    "pos.add_items": "Adicione itens para começar",
    "pos.subtotal": "Subtotal",
    "pos.tax": "Imposto",
    "pos.total": "Total",
    "pos.hold_order": "Reter Pedido",
    "pos.pay": "Pagar",
    "pos.cash": "Dinheiro",
    "pos.card": "Cartão",
    "pos.held_orders": "Pedidos Retidos",
    "pos.no_products": "Nenhum produto encontrado",
    "pos.add_products_settings": "Adicione produtos em Configurações",
    
    // Payment
    "payment.title": "Pagamento",
    "payment.method": "Método de Pagamento",
    "payment.cash_received": "Dinheiro Recebido",
    "payment.change": "Troco",
    "payment.complete": "Completar Pagamento",
    "payment.cancel": "Cancelar",
    
    // Settings
    "settings.title": "Configurações",
    "settings.subtitle": "Configure seu negócio e sistema POS",
    "settings.business": "Negócio",
    "settings.categories": "Categorias",
    "settings.products": "Produtos",
    "settings.users": "Usuários",
    "settings.floors": "Andares",
    "settings.tables": "Mesas",
    "settings.printing": "Impressão",
    "settings.invoicing": "Faturação",
    
    // Business Settings
    "business.title": "Informações do Negócio",
    "business.subtitle": "Detalhes do seu negócio mostrados nos recibos",
    "business.name": "Nome do Negócio",
    "business.type": "Tipo de Negócio",
    "business.address": "Endereço",
    "business.phone": "Telefone",
    "business.currency": "Moeda",
    "business.tax_rate": "Taxa de Imposto",
    "business.language": "Idioma",
    "business.edit": "Editar",
    "business.save": "Salvar Alterações",
    "business.cancel": "Cancelar",
    "business.not_set": "Não configurado",
    
    // Products
    "products.title": "Produtos",
    "products.add": "Adicionar Produto",
    "products.edit": "Editar Produto",
    "products.name": "Nome",
    "products.price": "Preço",
    "products.category": "Categoria",
    "products.sku": "SKU/Código de Barras",
    "products.description": "Descrição",
    "products.delete": "Excluir",
    "products.no_products": "Sem produtos ainda",
    "products.add_first": "Adicione seu primeiro produto para começar",
    
    // Categories
    "categories.title": "Categorias",
    "categories.add": "Adicionar Categoria",
    "categories.edit": "Editar Categoria",
    "categories.name": "Nome",
    "categories.color": "Cor",
    "categories.no_categories": "Sem categorias ainda",
    "categories.add_first": "Adicione sua primeira categoria",
    
    // Tables
    "tables.title": "Mesas",
    "tables.add": "Adicionar Mesa",
    "tables.capacity": "Capacidade",
    "tables.status": "Status",
    "tables.free": "Livre",
    "tables.occupied": "Ocupada",
    "tables.dirty": "Suja",
    "tables.reserved": "Reservada",
    
    // Kitchen
    "kitchen.title": "Tela da Cozinha",
    "kitchen.no_tickets": "Sem tickets ativos",
    "kitchen.waiting": "Aguardando pedidos",
    "kitchen.new": "Novo",
    "kitchen.preparing": "Preparando",
    "kitchen.ready": "Pronto",
    "kitchen.served": "Servido",
    
    // Inventory
    "inventory.title": "Estoque",
    "inventory.stock_levels": "Níveis de Estoque",
    "inventory.product": "Produto",
    "inventory.quantity": "Quantidade",
    "inventory.adjust": "Ajustar",
    "inventory.low_stock": "Estoque Baixo",
    
    // Reports
    "reports.title": "Relatórios",
    "reports.dashboard": "Painel",
    "reports.today_sales": "Vendas de Hoje",
    "reports.orders": "Pedidos",
    "reports.avg_order": "Pedido Médio",
    "reports.top_products": "Produtos Principais",
    "reports.sales_by_hour": "Vendas por Hora",
    
    // Common
    "common.save": "Salvar",
    "common.cancel": "Cancelar",
    "common.delete": "Excluir",
    "common.edit": "Editar",
    "common.add": "Adicionar",
    "common.loading": "Carregando...",
    "common.error": "Erro",
    "common.success": "Sucesso",
    "common.confirm": "Confirmar",
    "common.yes": "Sim",
    "common.no": "Não",
  },
  fr: {
    // Navigation
    "nav.pos": "Point de Vente",
    "nav.tables": "Tables",
    "nav.kitchen": "Cuisine",
    "nav.inventory": "Inventaire",
    "nav.reports": "Rapports",
    "nav.settings": "Paramètres",
    "nav.logout": "Déconnexion",
    
    // POS Page
    "pos.title": "Point de Vente",
    "pos.search": "Rechercher des produits...",
    "pos.all_categories": "Tous",
    "pos.cart": "Panier",
    "pos.empty_cart": "Panier vide",
    "pos.add_items": "Ajoutez des articles pour commencer",
    "pos.subtotal": "Sous-total",
    "pos.tax": "Taxe",
    "pos.total": "Total",
    "pos.hold_order": "Mettre en attente",
    "pos.pay": "Payer",
    "pos.cash": "Espèces",
    "pos.card": "Carte",
    "pos.held_orders": "Commandes en attente",
    "pos.no_products": "Aucun produit trouvé",
    "pos.add_products_settings": "Ajoutez des produits dans les Paramètres",
    
    // Payment
    "payment.title": "Paiement",
    "payment.method": "Mode de Paiement",
    "payment.cash_received": "Espèces Reçues",
    "payment.change": "Monnaie",
    "payment.complete": "Terminer le Paiement",
    "payment.cancel": "Annuler",
    
    // Settings
    "settings.title": "Paramètres",
    "settings.subtitle": "Configurez votre entreprise et système POS",
    "settings.business": "Entreprise",
    "settings.categories": "Catégories",
    "settings.products": "Produits",
    "settings.users": "Utilisateurs",
    "settings.floors": "Étages",
    "settings.tables": "Tables",
    "settings.printing": "Impression",
    "settings.invoicing": "Facturation",
    
    // Business Settings
    "business.title": "Informations de l'Entreprise",
    "business.subtitle": "Détails de votre entreprise affichés sur les reçus",
    "business.name": "Nom de l'Entreprise",
    "business.type": "Type d'Entreprise",
    "business.address": "Adresse",
    "business.phone": "Téléphone",
    "business.currency": "Devise",
    "business.tax_rate": "Taux de Taxe",
    "business.language": "Langue",
    "business.edit": "Modifier",
    "business.save": "Enregistrer les Modifications",
    "business.cancel": "Annuler",
    "business.not_set": "Non configuré",
    
    // Products
    "products.title": "Produits",
    "products.add": "Ajouter un Produit",
    "products.edit": "Modifier le Produit",
    "products.name": "Nom",
    "products.price": "Prix",
    "products.category": "Catégorie",
    "products.sku": "SKU/Code-barres",
    "products.description": "Description",
    "products.delete": "Supprimer",
    "products.no_products": "Pas encore de produits",
    "products.add_first": "Ajoutez votre premier produit pour commencer",
    
    // Categories
    "categories.title": "Catégories",
    "categories.add": "Ajouter une Catégorie",
    "categories.edit": "Modifier la Catégorie",
    "categories.name": "Nom",
    "categories.color": "Couleur",
    "categories.no_categories": "Pas encore de catégories",
    "categories.add_first": "Ajoutez votre première catégorie",
    
    // Tables
    "tables.title": "Tables",
    "tables.add": "Ajouter une Table",
    "tables.capacity": "Capacité",
    "tables.status": "Statut",
    "tables.free": "Libre",
    "tables.occupied": "Occupée",
    "tables.dirty": "Sale",
    "tables.reserved": "Réservée",
    
    // Kitchen
    "kitchen.title": "Affichage Cuisine",
    "kitchen.no_tickets": "Pas de tickets actifs",
    "kitchen.waiting": "En attente de commandes",
    "kitchen.new": "Nouveau",
    "kitchen.preparing": "En préparation",
    "kitchen.ready": "Prêt",
    "kitchen.served": "Servi",
    
    // Inventory
    "inventory.title": "Inventaire",
    "inventory.stock_levels": "Niveaux de Stock",
    "inventory.product": "Produit",
    "inventory.quantity": "Quantité",
    "inventory.adjust": "Ajuster",
    "inventory.low_stock": "Stock Faible",
    
    // Reports
    "reports.title": "Rapports",
    "reports.dashboard": "Tableau de Bord",
    "reports.today_sales": "Ventes du Jour",
    "reports.orders": "Commandes",
    "reports.avg_order": "Commande Moyenne",
    "reports.top_products": "Meilleurs Produits",
    "reports.sales_by_hour": "Ventes par Heure",
    
    // Common
    "common.save": "Enregistrer",
    "common.cancel": "Annuler",
    "common.delete": "Supprimer",
    "common.edit": "Modifier",
    "common.add": "Ajouter",
    "common.loading": "Chargement...",
    "common.error": "Erreur",
    "common.success": "Succès",
    "common.confirm": "Confirmer",
    "common.yes": "Oui",
    "common.no": "Non",
  },
  de: {
    // Navigation
    "nav.pos": "Kasse",
    "nav.tables": "Tische",
    "nav.kitchen": "Küche",
    "nav.inventory": "Inventar",
    "nav.reports": "Berichte",
    "nav.settings": "Einstellungen",
    "nav.logout": "Abmelden",
    
    // POS Page
    "pos.title": "Kasse",
    "pos.search": "Produkte suchen...",
    "pos.all_categories": "Alle",
    "pos.cart": "Warenkorb",
    "pos.empty_cart": "Warenkorb leer",
    "pos.add_items": "Artikel hinzufügen um zu beginnen",
    "pos.subtotal": "Zwischensumme",
    "pos.tax": "Steuer",
    "pos.total": "Gesamt",
    "pos.hold_order": "Bestellung zurückstellen",
    "pos.pay": "Bezahlen",
    "pos.cash": "Bar",
    "pos.card": "Karte",
    "pos.held_orders": "Zurückgestellte Bestellungen",
    "pos.no_products": "Keine Produkte gefunden",
    "pos.add_products_settings": "Produkte in Einstellungen hinzufügen",
    
    // Payment
    "payment.title": "Zahlung",
    "payment.method": "Zahlungsmethode",
    "payment.cash_received": "Erhaltenes Bargeld",
    "payment.change": "Wechselgeld",
    "payment.complete": "Zahlung abschließen",
    "payment.cancel": "Abbrechen",
    
    // Settings
    "settings.title": "Einstellungen",
    "settings.subtitle": "Konfigurieren Sie Ihr Geschäft und POS-System",
    "settings.business": "Geschäft",
    "settings.categories": "Kategorien",
    "settings.products": "Produkte",
    "settings.users": "Benutzer",
    "settings.floors": "Etagen",
    "settings.tables": "Tische",
    "settings.printing": "Druck",
    "settings.invoicing": "Rechnungsstellung",
    
    // Business Settings
    "business.title": "Geschäftsinformationen",
    "business.subtitle": "Ihre Geschäftsdaten auf Quittungen",
    "business.name": "Geschäftsname",
    "business.type": "Geschäftstyp",
    "business.address": "Adresse",
    "business.phone": "Telefon",
    "business.currency": "Währung",
    "business.tax_rate": "Steuersatz",
    "business.language": "Sprache",
    "business.edit": "Bearbeiten",
    "business.save": "Änderungen speichern",
    "business.cancel": "Abbrechen",
    "business.not_set": "Nicht festgelegt",
    
    // Products
    "products.title": "Produkte",
    "products.add": "Produkt hinzufügen",
    "products.edit": "Produkt bearbeiten",
    "products.name": "Name",
    "products.price": "Preis",
    "products.category": "Kategorie",
    "products.sku": "SKU/Barcode",
    "products.description": "Beschreibung",
    "products.delete": "Löschen",
    "products.no_products": "Noch keine Produkte",
    "products.add_first": "Fügen Sie Ihr erstes Produkt hinzu",
    
    // Categories
    "categories.title": "Kategorien",
    "categories.add": "Kategorie hinzufügen",
    "categories.edit": "Kategorie bearbeiten",
    "categories.name": "Name",
    "categories.color": "Farbe",
    "categories.no_categories": "Noch keine Kategorien",
    "categories.add_first": "Fügen Sie Ihre erste Kategorie hinzu",
    
    // Tables
    "tables.title": "Tische",
    "tables.add": "Tisch hinzufügen",
    "tables.capacity": "Kapazität",
    "tables.status": "Status",
    "tables.free": "Frei",
    "tables.occupied": "Besetzt",
    "tables.dirty": "Schmutzig",
    "tables.reserved": "Reserviert",
    
    // Kitchen
    "kitchen.title": "Küchenanzeige",
    "kitchen.no_tickets": "Keine aktiven Tickets",
    "kitchen.waiting": "Warte auf Bestellungen",
    "kitchen.new": "Neu",
    "kitchen.preparing": "In Zubereitung",
    "kitchen.ready": "Fertig",
    "kitchen.served": "Serviert",
    
    // Inventory
    "inventory.title": "Inventar",
    "inventory.stock_levels": "Bestandsniveaus",
    "inventory.product": "Produkt",
    "inventory.quantity": "Menge",
    "inventory.adjust": "Anpassen",
    "inventory.low_stock": "Niedriger Bestand",
    
    // Reports
    "reports.title": "Berichte",
    "reports.dashboard": "Dashboard",
    "reports.today_sales": "Heutige Verkäufe",
    "reports.orders": "Bestellungen",
    "reports.avg_order": "Durchschnittliche Bestellung",
    "reports.top_products": "Top Produkte",
    "reports.sales_by_hour": "Verkäufe pro Stunde",
    
    // Common
    "common.save": "Speichern",
    "common.cancel": "Abbrechen",
    "common.delete": "Löschen",
    "common.edit": "Bearbeiten",
    "common.add": "Hinzufügen",
    "common.loading": "Laden...",
    "common.error": "Fehler",
    "common.success": "Erfolg",
    "common.confirm": "Bestätigen",
    "common.yes": "Ja",
    "common.no": "Nein",
  },
  zh: {
    // Navigation
    "nav.pos": "销售点",
    "nav.tables": "餐桌",
    "nav.kitchen": "厨房",
    "nav.inventory": "库存",
    "nav.reports": "报告",
    "nav.settings": "设置",
    "nav.logout": "退出",
    
    // POS Page
    "pos.title": "销售点",
    "pos.search": "搜索产品...",
    "pos.all_categories": "全部",
    "pos.cart": "购物车",
    "pos.empty_cart": "购物车为空",
    "pos.add_items": "添加商品开始",
    "pos.subtotal": "小计",
    "pos.tax": "税",
    "pos.total": "总计",
    "pos.hold_order": "保留订单",
    "pos.pay": "付款",
    "pos.cash": "现金",
    "pos.card": "银行卡",
    "pos.held_orders": "保留的订单",
    "pos.no_products": "未找到产品",
    "pos.add_products_settings": "在设置中添加产品",
    
    // Payment
    "payment.title": "付款",
    "payment.method": "付款方式",
    "payment.cash_received": "收到现金",
    "payment.change": "找零",
    "payment.complete": "完成付款",
    "payment.cancel": "取消",
    
    // Settings
    "settings.title": "设置",
    "settings.subtitle": "配置您的业务和POS系统",
    "settings.business": "业务",
    "settings.categories": "类别",
    "settings.products": "产品",
    "settings.users": "用户",
    "settings.floors": "楼层",
    "settings.tables": "餐桌",
    "settings.printing": "打印",
    "settings.invoicing": "开票",
    
    // Business Settings
    "business.title": "业务信息",
    "business.subtitle": "您的业务详情显示在收据上",
    "business.name": "业务名称",
    "business.type": "业务类型",
    "business.address": "地址",
    "business.phone": "电话",
    "business.currency": "货币",
    "business.tax_rate": "税率",
    "business.language": "语言",
    "business.edit": "编辑",
    "business.save": "保存更改",
    "business.cancel": "取消",
    "business.not_set": "未设置",
    
    // Products
    "products.title": "产品",
    "products.add": "添加产品",
    "products.edit": "编辑产品",
    "products.name": "名称",
    "products.price": "价格",
    "products.category": "类别",
    "products.sku": "SKU/条形码",
    "products.description": "描述",
    "products.delete": "删除",
    "products.no_products": "暂无产品",
    "products.add_first": "添加您的第一个产品开始",
    
    // Categories
    "categories.title": "类别",
    "categories.add": "添加类别",
    "categories.edit": "编辑类别",
    "categories.name": "名称",
    "categories.color": "颜色",
    "categories.no_categories": "暂无类别",
    "categories.add_first": "添加您的第一个类别",
    
    // Tables
    "tables.title": "餐桌",
    "tables.add": "添加餐桌",
    "tables.capacity": "容量",
    "tables.status": "状态",
    "tables.free": "空闲",
    "tables.occupied": "占用",
    "tables.dirty": "待清理",
    "tables.reserved": "预订",
    
    // Kitchen
    "kitchen.title": "厨房显示",
    "kitchen.no_tickets": "没有活动订单",
    "kitchen.waiting": "等待订单",
    "kitchen.new": "新订单",
    "kitchen.preparing": "准备中",
    "kitchen.ready": "就绪",
    "kitchen.served": "已上菜",
    
    // Inventory
    "inventory.title": "库存",
    "inventory.stock_levels": "库存水平",
    "inventory.product": "产品",
    "inventory.quantity": "数量",
    "inventory.adjust": "调整",
    "inventory.low_stock": "库存不足",
    
    // Reports
    "reports.title": "报告",
    "reports.dashboard": "仪表板",
    "reports.today_sales": "今日销售",
    "reports.orders": "订单",
    "reports.avg_order": "平均订单",
    "reports.top_products": "热门产品",
    "reports.sales_by_hour": "每小时销售",
    
    // Common
    "common.save": "保存",
    "common.cancel": "取消",
    "common.delete": "删除",
    "common.edit": "编辑",
    "common.add": "添加",
    "common.loading": "加载中...",
    "common.error": "错误",
    "common.success": "成功",
    "common.confirm": "确认",
    "common.yes": "是",
    "common.no": "否",
  },
  ja: {
    // Navigation
    "nav.pos": "POS",
    "nav.tables": "テーブル",
    "nav.kitchen": "キッチン",
    "nav.inventory": "在庫",
    "nav.reports": "レポート",
    "nav.settings": "設定",
    "nav.logout": "ログアウト",
    
    // POS Page
    "pos.title": "POS",
    "pos.search": "商品を検索...",
    "pos.all_categories": "すべて",
    "pos.cart": "カート",
    "pos.empty_cart": "カートは空です",
    "pos.add_items": "商品を追加してください",
    "pos.subtotal": "小計",
    "pos.tax": "税金",
    "pos.total": "合計",
    "pos.hold_order": "注文を保留",
    "pos.pay": "支払い",
    "pos.cash": "現金",
    "pos.card": "カード",
    "pos.held_orders": "保留中の注文",
    "pos.no_products": "商品が見つかりません",
    "pos.add_products_settings": "設定で商品を追加",
    
    // Payment
    "payment.title": "支払い",
    "payment.method": "支払い方法",
    "payment.cash_received": "受取金額",
    "payment.change": "お釣り",
    "payment.complete": "支払いを完了",
    "payment.cancel": "キャンセル",
    
    // Settings
    "settings.title": "設定",
    "settings.subtitle": "ビジネスとPOSシステムを設定",
    "settings.business": "ビジネス",
    "settings.categories": "カテゴリ",
    "settings.products": "商品",
    "settings.users": "ユーザー",
    "settings.floors": "フロア",
    "settings.tables": "テーブル",
    "settings.printing": "印刷",
    "settings.invoicing": "請求書",
    
    // Business Settings
    "business.title": "ビジネス情報",
    "business.subtitle": "レシートに表示されるビジネス詳細",
    "business.name": "ビジネス名",
    "business.type": "ビジネスタイプ",
    "business.address": "住所",
    "business.phone": "電話番号",
    "business.currency": "通貨",
    "business.tax_rate": "税率",
    "business.language": "言語",
    "business.edit": "編集",
    "business.save": "変更を保存",
    "business.cancel": "キャンセル",
    "business.not_set": "未設定",
    
    // Products
    "products.title": "商品",
    "products.add": "商品を追加",
    "products.edit": "商品を編集",
    "products.name": "名前",
    "products.price": "価格",
    "products.category": "カテゴリ",
    "products.sku": "SKU/バーコード",
    "products.description": "説明",
    "products.delete": "削除",
    "products.no_products": "商品がありません",
    "products.add_first": "最初の商品を追加",
    
    // Categories
    "categories.title": "カテゴリ",
    "categories.add": "カテゴリを追加",
    "categories.edit": "カテゴリを編集",
    "categories.name": "名前",
    "categories.color": "色",
    "categories.no_categories": "カテゴリがありません",
    "categories.add_first": "最初のカテゴリを追加",
    
    // Tables
    "tables.title": "テーブル",
    "tables.add": "テーブルを追加",
    "tables.capacity": "定員",
    "tables.status": "状態",
    "tables.free": "空き",
    "tables.occupied": "使用中",
    "tables.dirty": "清掃待ち",
    "tables.reserved": "予約済み",
    
    // Kitchen
    "kitchen.title": "キッチンディスプレイ",
    "kitchen.no_tickets": "アクティブなチケットなし",
    "kitchen.waiting": "注文待ち",
    "kitchen.new": "新規",
    "kitchen.preparing": "調理中",
    "kitchen.ready": "準備完了",
    "kitchen.served": "提供済み",
    
    // Inventory
    "inventory.title": "在庫",
    "inventory.stock_levels": "在庫レベル",
    "inventory.product": "商品",
    "inventory.quantity": "数量",
    "inventory.adjust": "調整",
    "inventory.low_stock": "在庫不足",
    
    // Reports
    "reports.title": "レポート",
    "reports.dashboard": "ダッシュボード",
    "reports.today_sales": "本日の売上",
    "reports.orders": "注文",
    "reports.avg_order": "平均注文額",
    "reports.top_products": "人気商品",
    "reports.sales_by_hour": "時間別売上",
    
    // Common
    "common.save": "保存",
    "common.cancel": "キャンセル",
    "common.delete": "削除",
    "common.edit": "編集",
    "common.add": "追加",
    "common.loading": "読み込み中...",
    "common.error": "エラー",
    "common.success": "成功",
    "common.confirm": "確認",
    "common.yes": "はい",
    "common.no": "いいえ",
  },
  ko: {
    // Navigation
    "nav.pos": "POS",
    "nav.tables": "테이블",
    "nav.kitchen": "주방",
    "nav.inventory": "재고",
    "nav.reports": "보고서",
    "nav.settings": "설정",
    "nav.logout": "로그아웃",
    
    // POS Page
    "pos.title": "POS",
    "pos.search": "제품 검색...",
    "pos.all_categories": "전체",
    "pos.cart": "장바구니",
    "pos.empty_cart": "장바구니가 비어 있습니다",
    "pos.add_items": "상품을 추가하세요",
    "pos.subtotal": "소계",
    "pos.tax": "세금",
    "pos.total": "합계",
    "pos.hold_order": "주문 보류",
    "pos.pay": "결제",
    "pos.cash": "현금",
    "pos.card": "카드",
    "pos.held_orders": "보류된 주문",
    "pos.no_products": "제품이 없습니다",
    "pos.add_products_settings": "설정에서 제품 추가",
    
    // Payment
    "payment.title": "결제",
    "payment.method": "결제 방법",
    "payment.cash_received": "받은 현금",
    "payment.change": "거스름돈",
    "payment.complete": "결제 완료",
    "payment.cancel": "취소",
    
    // Settings
    "settings.title": "설정",
    "settings.subtitle": "비즈니스 및 POS 시스템 구성",
    "settings.business": "비즈니스",
    "settings.categories": "카테고리",
    "settings.products": "제품",
    "settings.users": "사용자",
    "settings.floors": "층",
    "settings.tables": "테이블",
    "settings.printing": "인쇄",
    "settings.invoicing": "송장",
    
    // Business Settings
    "business.title": "비즈니스 정보",
    "business.subtitle": "영수증에 표시되는 비즈니스 세부정보",
    "business.name": "비즈니스 이름",
    "business.type": "비즈니스 유형",
    "business.address": "주소",
    "business.phone": "전화번호",
    "business.currency": "통화",
    "business.tax_rate": "세율",
    "business.language": "언어",
    "business.edit": "편집",
    "business.save": "변경사항 저장",
    "business.cancel": "취소",
    "business.not_set": "미설정",
    
    // Products
    "products.title": "제품",
    "products.add": "제품 추가",
    "products.edit": "제품 편집",
    "products.name": "이름",
    "products.price": "가격",
    "products.category": "카테고리",
    "products.sku": "SKU/바코드",
    "products.description": "설명",
    "products.delete": "삭제",
    "products.no_products": "제품이 없습니다",
    "products.add_first": "첫 번째 제품을 추가하세요",
    
    // Categories
    "categories.title": "카테고리",
    "categories.add": "카테고리 추가",
    "categories.edit": "카테고리 편집",
    "categories.name": "이름",
    "categories.color": "색상",
    "categories.no_categories": "카테고리가 없습니다",
    "categories.add_first": "첫 번째 카테고리를 추가하세요",
    
    // Tables
    "tables.title": "테이블",
    "tables.add": "테이블 추가",
    "tables.capacity": "수용인원",
    "tables.status": "상태",
    "tables.free": "비어있음",
    "tables.occupied": "사용중",
    "tables.dirty": "청소필요",
    "tables.reserved": "예약됨",
    
    // Kitchen
    "kitchen.title": "주방 디스플레이",
    "kitchen.no_tickets": "활성 티켓 없음",
    "kitchen.waiting": "주문 대기중",
    "kitchen.new": "신규",
    "kitchen.preparing": "준비중",
    "kitchen.ready": "준비완료",
    "kitchen.served": "서빙완료",
    
    // Inventory
    "inventory.title": "재고",
    "inventory.stock_levels": "재고 수준",
    "inventory.product": "제품",
    "inventory.quantity": "수량",
    "inventory.adjust": "조정",
    "inventory.low_stock": "재고 부족",
    
    // Reports
    "reports.title": "보고서",
    "reports.dashboard": "대시보드",
    "reports.today_sales": "오늘 매출",
    "reports.orders": "주문",
    "reports.avg_order": "평균 주문",
    "reports.top_products": "인기 제품",
    "reports.sales_by_hour": "시간별 매출",
    
    // Common
    "common.save": "저장",
    "common.cancel": "취소",
    "common.delete": "삭제",
    "common.edit": "편집",
    "common.add": "추가",
    "common.loading": "로딩중...",
    "common.error": "오류",
    "common.success": "성공",
    "common.confirm": "확인",
    "common.yes": "예",
    "common.no": "아니오",
  },
};

type Language = keyof typeof translations;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children, initialLanguage = "en" }: { children: ReactNode; initialLanguage?: string }) {
  const validLang = (initialLanguage && initialLanguage in translations) ? initialLanguage as Language : "en";
  const [language, setLanguageState] = useState<Language>(validLang);

  // Sync with initialLanguage prop changes (e.g., when tenant language is updated)
  useEffect(() => {
    if (initialLanguage && initialLanguage in translations) {
      setLanguageState(initialLanguage as Language);
    }
  }, [initialLanguage]);

  const setLanguage = (lang: Language) => {
    if (lang in translations) {
      setLanguageState(lang);
    }
  };

  const t = (key: TranslationKey): string => {
    const translation = translations[language]?.[key];
    if (!translation) {
      return translations.en[key] || key;
    }
    return translation;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

export { translations };
export type { Language, TranslationKey };
