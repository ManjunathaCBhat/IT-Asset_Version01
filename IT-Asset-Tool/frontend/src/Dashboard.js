import React, { useEffect, useState, useCallback } from 'react';
import { Card, Col, Row, Statistic, Typography, Spin, Alert, Button, Space, List } from 'antd';
import {
    DatabaseOutlined, CheckCircleOutlined, ToolOutlined, WarningOutlined, DeleteOutlined,
    LaptopOutlined, DesktopOutlined, AudioOutlined, ReloadOutlined,
    // NEW ICONS FOR KEYBOARD AND MOUSE
    AimOutlined, BorderlessTableOutlined, // Used for Mouse and Keyboard respectively
    MinusCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';

import { message } from 'antd';
import moment from 'moment';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ;

const { Title, Text } = Typography;

// Helper function for status colors (keep this consistent with AppLayout)
const getStatusColor = (status) => {
    const colors = {
        'In Use': '#7ED321',
        'In Stock': '#FA8C16', // Orange
        'Damaged': '#D0021B', // Red
        'E-Waste': '#8B572A',  // Brown
        'Removed': '#555555' // Dark gray for Removed status
    };
    return colors[status] || 'rgba(0, 0, 0, 0.85)';
};

// --- Helper function for grouping and counting by category ---
const summarizeByCategory = (assets) => {
    const categorySummary = {};

    assets.forEach(asset => {
        const category = asset.category || 'Uncategorized';
        if (!categorySummary[category]) {
            categorySummary[category] = {
                category: category,
                inUse: 0,
                inStock: 0,
                damaged: 0,
                eWaste: 0,
                removed: 0,
                total: 0
            };
        }

        switch (asset.status) {
            case 'In Use':
                categorySummary[category].inUse++;
                break;
            case 'In Stock':
                categorySummary[category].inStock++;
                break;
            case 'Damaged':
                categorySummary[category].damaged++;
                break;
            case 'E-Waste':
                categorySummary[category].eWaste++;
                break;
            case 'Removed':
                categorySummary[category].removed++;
                break;
            default:
                break;
        }
        categorySummary[category].total++;
    });

    // Explicitly add desired categories to ensure they always show up, even with 0 items
    const desiredCategories = ['Laptop', 'Headset', 'Mouse', 'Monitor', 'Keyboard'];
    desiredCategories.forEach(cat => {
        if (!categorySummary[cat]) {
            categorySummary[cat] = {
                category: cat,
                inUse: 0,
                inStock: 0,
                damaged: 0,
                eWaste: 0,
                removed: 0,
                total: 0
            };
        }
    });

    return Object.values(categorySummary).sort((a, b) => a.category.localeCompare(b.category));
};

// Helper to get icon based on category name
const getCategoryIcon = (category) => {
    switch (category) {
        case 'Computer':
        case 'Laptop':
            return <LaptopOutlined style={{ fontSize: '48px', color: '#4A90E2' }} />;
        case 'Headset':
            return <AudioOutlined style={{ fontSize: '48px', color: '#4A90E2' }} />;
        case 'Mouse':
            return <AimOutlined style={{ fontSize: '48px', color: '#4A90E2' }} />;
        case 'Keyboard':
            return <BorderlessTableOutlined style={{ fontSize: '48px', color: '#4A90E2' }} />;
        case 'Monitor':
            return <DesktopOutlined style={{ fontSize: '48px', color: '#4A90E2' }} />;
        default:
            return <DatabaseOutlined style={{ fontSize: '48px', color: '#888' }} />;
    }
};

const Dashboard = () => {
    const [summaryData, setSummaryData] = useState({
        totalAssets: 0,
        inUse: 0,
        inStock: 0,
        damaged: 0,
        eWaste: 0,
        removed: 0,
    });
    const [categoryAssetSummaries, setCategoryAssetSummaries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const getAuthHeader = useCallback(() => {
        const token = localStorage.getItem('token');
        return token ? { 'x-auth-token': token } : {};
    }, []);

    const fetchDashboardData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const allAssetsRes = await axios.get(`${API_BASE_URL}/api/equipment`, {
                headers: getAuthHeader(),
                params: { _t: Date.now() }
            });

            const allAssets = allAssetsRes.data;

            // Calculate summary data from actual assets
            const calculatedSummary = {
                totalAssets: allAssets.length,
                inUse: allAssets.filter(asset => asset.status === 'In Use').length,
                inStock: allAssets.filter(asset => asset.status === 'In Stock').length,
                damaged: allAssets.filter(asset => asset.status === 'Damaged').length,
                eWaste: allAssets.filter(asset => asset.status === 'E-Waste').length,
                removed: allAssets.filter(asset => asset.status === 'Removed').length,
            };

            setSummaryData(calculatedSummary);

            const groupedSummary = summarizeByCategory(allAssets);
            setCategoryAssetSummaries(groupedSummary);

            setLastUpdated(new Date());

        } catch (err) {
            console.error('Failed to fetch dashboard data:', err.response ? err.response.data : err.message);
            setError('Failed to load dashboard data. Please check your network and backend server.');
        } finally {
            setLoading(false);
        }
    }, [getAuthHeader]);

    // Manual refresh function
    const refreshDashboard = async () => {
        try {
            await fetchDashboardData();
            message.success('Dashboard data refreshed successfully');
        } catch (error) {
            message.error('Failed to refresh dashboard data');
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    return (
        <div>
            {error && <Alert message="Error" description={error} type="error" showIcon style={{ marginBottom: '20px' }} />}

            {/* Header with Refresh Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <Title level={3} style={{ margin: 0 }}>Dashboard Overview</Title>
                           </div>

            {/* Top Row for Overall Summary Statistics */}
            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                    <Card variant="outlined" hoverable>
                        <Statistic
                            title="Total Assets"
                            value={summaryData.totalAssets}
                            prefix={<DatabaseOutlined style={{ color: '#4A90E2' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                    <Card variant="outlined" hoverable>
                        <Statistic
                            title="In Use"
                            value={summaryData.inUse}
                            prefix={<ToolOutlined style={{ color: '#7ED321' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                    <Card variant="outlined" hoverable>
                        <Statistic
                            title="In Stock"
                            value={summaryData.inStock}
                            prefix={<CheckCircleOutlined style={{ color: '#FA8C16' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                    <Card variant="outlined" hoverable>
                        <Statistic
                            title="Damaged"
                            value={summaryData.damaged}
                            prefix={<WarningOutlined style={{ color: '#D0021B' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                    <Card variant="outlined" hoverable>
                        <Statistic
                            title="E-Waste"
                            value={summaryData.eWaste}
                            prefix={<DeleteOutlined style={{ color: '#8B572A' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                    <Card variant="outlined" hoverable>
                        <Statistic
                            title="Removed"
                            value={summaryData.removed}
                            prefix={<MinusCircleOutlined style={{ color: getStatusColor('Removed') }} />}
                        />
                    </Card>
                </Col>
            </Row>

            <Title level={4} style={{ marginBottom: '24px', marginTop: '32px' }}>Assets by Category</Title>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <Spin size="large" tip="Loading Categories..." />
                </div>
            ) : categoryAssetSummaries.length === 0 ? (
                <Alert
                    message="No Asset Categories Found"
                    description="It looks like there are no assets categorized yet or data is not available."
                    type="info"
                    showIcon
                />
            ) : (
                <Row gutter={[16, 16]}>
                    {categoryAssetSummaries.map((categoryData) => (
                        <Col key={categoryData.category} xs={24} sm={12} md={8} lg={6} xl={4}>
                            <Card
                                title={
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Text strong style={{ fontSize: '16px' }}>
                                            {categoryData.category} ({categoryData.total})
                                        </Text>
                                    </div>
                                }
                                hoverable
                                styles={{ body: { padding: '16px' } }}
                                variant="outlined"
                            >
                                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                                    <div style={{ width: '40%', display: 'flex', justifyContent: 'center' }}>
                                        {getCategoryIcon(categoryData.category)}
                                    </div>
                                    <List
                                        itemLayout="horizontal"
                                        dataSource={[
                                            { label: 'In Use', count: categoryData.inUse, color: getStatusColor('In Use') },
                                            { label: 'In Stock', count: categoryData.inStock, color: getStatusColor('In Stock') },
                                            { label: 'Damaged', count: categoryData.damaged, color: getStatusColor('Damaged') },
                                            { label: 'E-Waste', count: categoryData.eWaste, color: getStatusColor('E-Waste') },
                                            { label: 'Removed', count: categoryData.removed, color: getStatusColor('Removed') },
                                        ]}
                                        renderItem={item => (
                                            <List.Item style={{ padding: '4px 0', borderBottom: 'none' }}>
                                                <List.Item.Meta
                                                    title={<Text style={{ color: item.color, fontSize: '12px' }}>{item.label}</Text>}
                                                />
                                                <div>
                                                    <Text style={{ fontWeight: 'bold', fontSize: '12px', color: item.color }}>{item.count}</Text>
                                                </div>
                                            </List.Item>
                                        )}
                                        style={{ padding: 0, width: '60%' }}
                                    />
                                </div>
                            </Card>
                        </Col>
                    ))}
                </Row>
            )}
        </div>
    );
};

export default Dashboard;
