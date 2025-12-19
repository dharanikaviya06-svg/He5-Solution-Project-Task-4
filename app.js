class InvoiceHub {
    constructor() {
        this.API_BASE = 'http://localhost:5000/api';
        this.currentInvoice = { client_name: '', items: [] };
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadDashboard();
        this.showView('dashboard');
    }

    bindEvents() {
        document.querySelectorAll('.sidebar li').forEach(li => {
            li.addEventListener('click', (e) => {
                document.querySelector('.sidebar li.active').classList.remove('active');
                li.classList.add('active');
                this.showView(li.dataset.view);
            });
        });

        document.getElementById('add-item').addEventListener('click', () => this.addItemRow());
        document.getElementById('client-name').addEventListener('input', (e) => {
            this.currentInvoice.client_name = e.target.value;
        });
        document.getElementById('save-invoice').addEventListener('click', () => this.saveInvoice());
        document.getElementById('download-pdf').addEventListener('click', () => this.downloadPDF());
        document.getElementById('print-invoice').addEventListener('click', () => window.print());

        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('quantity') || 
                e.target.classList.contains('unit-price') || 
                e.target.classList.contains('gst-percentage') ||
                e.target.classList.contains('item-name')) {
                this.calculateItemTotal(e.target.closest('.item-row'));
                this.calculateInvoiceTotal();
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-item')) {
                e.target.closest('.item-row').remove();
                this.calculateInvoiceTotal();
            }
        });
    }

    showView(viewName) {
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        document.getElementById(viewName).classList.add('active');
        
        if (viewName === 'create') this.resetInvoiceForm();
        if (viewName === 'clients') this.loadClients();
        if (viewName === 'items') this.loadItems();
    }

    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.API_BASE}${endpoint}`, {
                ...options,
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...options.headers 
                }
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error ${response.status}: ${errorText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API Call Error:', error);
            throw error;
        }
    }

    async loadDashboard() {
        try {
            const [stats, invoices] = await Promise.all([
                this.apiCall('/dashboard'),
                this.apiCall('/invoices')
            ]);

            document.getElementById('total-invoices').textContent = stats.total_invoices;
            document.getElementById('total-revenue').textContent = `₹${Number(stats.total_revenue).toLocaleString('en-IN')}`;
            document.getElementById('pending-amount').textContent = `₹${Number(stats.pending_amount).toLocaleString('en-IN')}`;

            const tbody = document.getElementById('recent-invoices');
            tbody.innerHTML = invoices.map(inv => `
                <tr>
                    <td>${inv.invoice_number}</td>
                    <td>${inv.client_name}</td>
                    <td>${new Date(inv.created_at).toLocaleDateString()}</td>
                    <td>₹${Number(inv.grand_total).toLocaleString('en-IN')}</td>
                    <td><span class="status-${inv.status}">${inv.status}</span></td>
                    <td><button class="btn-small" onclick="app.viewInvoice(${inv.id})">View</button></td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Dashboard load error:', error);
        }
    }

    addItemRow() {
        const container = document.getElementById('items-container');
        const index = container.children.length;
        const row = document.createElement('div');
        row.className = 'item-row';
        row.dataset.index = index;
        row.innerHTML = `
            <input type="text" class="item-name" placeholder="Enter item name" required>
            <input type="number" class="quantity" placeholder="0.00" min="0.01" step="0.01" required>
            <input type="number" class="unit-price" placeholder="0.00" min="0" step="0.01" required>
            <input type="number" class="gst-percentage" placeholder="18.00" value="18" min="0" max="28" step="0.01" required>
            <div class="item-total">₹0.00</div>
            <button type="button" class="remove-item">×</button>
        `;
        container.appendChild(row);
    }

    calculateItemTotal(row) {
        const qty = parseFloat(row.querySelector('.quantity').value) || 0;
        const price = parseFloat(row.querySelector('.unit-price').value) || 0;
        const gst = parseFloat(row.querySelector('.gst-percentage').value) || 0;
        
        const subtotal = qty * price;
        const gstAmount = subtotal * (gst / 100);
        const total = subtotal + gstAmount;
        
        row.querySelector('.item-total').textContent = `₹${total.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }

    calculateInvoiceTotal() {
        let subtotal = 0, totalGst = 0;
        document.querySelectorAll('.item-row').forEach(row => {
            const qty = parseFloat(row.querySelector('.quantity').value) || 0;
            const price = parseFloat(row.querySelector('.unit-price').value) || 0;
            const gstRate = parseFloat(row.querySelector('.gst-percentage').value) || 0;
            
            const itemSubtotal = qty * price;
            const itemGst = itemSubtotal * (gstRate / 100);
            
            subtotal += itemSubtotal;
            totalGst += itemGst;
        });

        const grandTotal = subtotal + totalGst;
        
        document.getElementById('subtotal').textContent = `₹${subtotal.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('total-gst').textContent = `₹${totalGst.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        document.getElementById('grand-total').textContent = `₹${grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }

    async saveInvoice() {
        const clientName = document.getElementById('client-name').value.trim();
        if (!clientName) {
            alert('❌ Please enter client name');
            return;
        }

        const items = [];
        document.querySelectorAll('.item-row').forEach(row => {
            const name = row.querySelector('.item-name').value.trim();
            const qty = parseFloat(row.querySelector('.quantity').value) || 0;
            const price = parseFloat(row.querySelector('.unit-price').value) || 0;
            const gst = parseFloat(row.querySelector('.gst-percentage').value) || 0;
            
            if (name && qty > 0 && price > 0) {
                const subtotal = qty * price;
                const gstAmount = subtotal * (gst / 100);
                items.push({
                    name: name,
                    quantity: qty,
                    unit_price: price,
                    gst_percentage: gst,
                    item_total: subtotal,
                    gst_amount: gstAmount
                });
            }
        });

        if (items.length === 0) {
            alert('❌ Please add at least one valid item with quantity and price');
            return;
        }

        try {
            document.getElementById('save-invoice').textContent = 'Saving...';
            document.getElementById('save-invoice').disabled = true;
            
            const result = await this.apiCall('/invoices', {
                method: 'POST',
                body: JSON.stringify({ 
                    client_name: clientName, 
                    items: items 
                })
            });
            
            alert(`✅ Invoice ${result.invoice_number} saved successfully!`);
            this.resetInvoiceForm();
            this.showView('dashboard');
            this.loadDashboard();
        } catch (error) {
            console.error('Save error:', error);
            alert(`❌ Save failed: ${error.message}`);
        } finally {
            document.getElementById('save-invoice').textContent = '💾 Save Invoice';
            document.getElementById('save-invoice').disabled = false;
        }
    }

    resetInvoiceForm() {
        document.getElementById('client-name').value = '';
        document.getElementById('items-container').innerHTML = `
            <div class="item-row" data-index="0">
                <input type="text" class="item-name" placeholder="Enter item name" required>
                <input type="number" class="quantity" placeholder="0.00" min="0.01" step="0.01" required>
                <input type="number" class="unit-price" placeholder="0.00" min="0" step="0.01" required>
                <input type="number" class="gst-percentage" placeholder="18.00" value="18" min="0" max="28" step="0.01" required>
                <div class="item-total">₹0.00</div>
                <button type="button" class="remove-item" style="display:none">×</button>
            </div>
        `;
        document.getElementById('subtotal').textContent = '₹0.00';
        document.getElementById('total-gst').textContent = '₹0.00';
        document.getElementById('grand-total').textContent = '₹0.00';
    }

    async downloadPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        
        const clientName = document.getElementById('client-name').value || 'Client';
        const items = [];
        let subtotal = 0, totalGst = 0;
        
        document.querySelectorAll('.item-row').forEach(row => {
            const name = row.querySelector('.item-name').value;
            const qty = parseFloat(row.querySelector('.quantity').value) || 0;
            const price = parseFloat(row.querySelector('.unit-price').value) || 0;
            const gst = parseFloat(row.querySelector('.gst-percentage').value) || 0;
            
            if (name && qty > 0 && price > 0) {
                const itemSubtotal = qty * price;
                const itemGst = itemSubtotal * (gst / 100);
                subtotal += itemSubtotal;
                totalGst += itemGst;
                
                items.push([
                    name.substring(0, 25), 
                    qty.toFixed(2), 
                    `₹${price.toFixed(2)}`, 
                    `₹${itemSubtotal.toFixed(2)}`, 
                    `${gst}%`, 
                    `₹${itemGst.toFixed(2)}`
                ]);
            }
        });
        
        const grandTotal = subtotal + totalGst;
        
        doc.setFontSize(22);
        doc.text('INVOICE', 20, 30, { align: 'left' });
        doc.setFontSize(14);
        doc.text(`Client: ${clientName}`, 20, 50);
        doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 20, 65);
        
        doc.autoTable({
            startY: 85,
            head: [['Item', 'Qty', 'Rate', 'Amount', 'GST', 'GST Amt']],
            body: items,
            theme: 'grid',
            styles: { fontSize: 9, cellPadding: 3 },
            headStyles: { fillColor: [102, 126, 234], textColor: 255, fontStyle: 'bold' },
            columnStyles: { 0: { cellWidth: 35 } }
        });
        
        const finalY = doc.lastAutoTable.finalY + 15;
        doc.setFontSize(12);
        doc.text(`Subtotal: ₹${subtotal.toFixed(2)}`, 140, finalY);
        doc.text(`Total GST: ₹${totalGst.toFixed(2)}`, 140, finalY + 8);
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text(`Grand Total: ₹${grandTotal.toFixed(2)}`, 140, finalY + 25);
        
        doc.save(`invoice-${Date.now()}.pdf`);
    }

    async loadClients() {
        try {
            const clients = await this.apiCall('/clients');
            const tbody = document.getElementById('clients-table');
            tbody.innerHTML = clients.map(c => `
                <tr>
                    <td>${c.id}</td>
                    <td>${c.name}</td>
                    <td>${new Date(c.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Clients load error:', error);
        }
    }

    async loadItems() {
        try {
            const items = await this.apiCall('/items');
            const tbody = document.getElementById('items-table');
            tbody.innerHTML = items.map(item => `
                <tr>
                    <td>${item.id}</td>
                    <td>${item.name}</td>
                    <td>${item.gst_percentage}%</td>
                    <td>${new Date(item.created_at).toLocaleDateString('en-IN')}</td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Items load error:', error);
        }
    }

    async viewInvoice(id) {
        try {
            const invoice = await this.apiCall(`/invoices/${id}`);
            alert(`Invoice #${invoice.invoice_number}\nClient: ${invoice.client_name}\nTotal: ₹${invoice.grand_total.toLocaleString('en-IN')}`);
        } catch (error) {
            alert('Error loading invoice details');
        }
    }
}

const app = new InvoiceHub();
